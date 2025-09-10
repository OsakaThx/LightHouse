const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Normalize and validate email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587;
const EMAIL_SECURE = String(process.env.EMAIL_SECURE).toLowerCase() === 'true' || EMAIL_PORT === 465;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

if (!EMAIL_USER || !EMAIL_PASSWORD) {
  console.warn('[emailService] EMAIL_USER/EMAIL_PASSWORD no configurados. Configura tu .env.');
}

// Create the transporter with environment variables
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_SECURE,
  auth: EMAIL_USER && EMAIL_PASSWORD ? {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD
  } : undefined,
  tls: {
    // En producción se recomienda validar certificados. Puedes ajustarlo según tu proveedor
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  },
  debug: process.env.NODE_ENV !== 'production',
  logger: process.env.NODE_ENV !== 'production'
});

console.log('Email service configured for:', EMAIL_USER || '(sin usuario)');

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('Error with email configuration:', error);
  } else {
    console.log('Server is ready to take our messages');
  }
});

// Function to send password reset email
async function sendPasswordResetEmail(email, resetToken) {
  console.log('Attempting to send password reset email to:', email);
  console.log('Using email service:', EMAIL_HOST, 'port:', EMAIL_PORT, 'secure:', EMAIL_SECURE);
  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.error('[emailService] Falta configuración de EMAIL_USER o EMAIL_PASSWORD. No se puede enviar correo.');
    return {
      success: false,
      error: 'Configuración de correo incompleta (EMAIL_USER/EMAIL_PASSWORD)'
    };
  }
  
  try {
    // Generate reset URL
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    console.log('Generated reset URL:', resetUrl);
    
    // Read email template
    const templatePath = path.join(__dirname, '..', 'emails', 'password-reset.html');
    console.log('Looking for email template at:', templatePath);
    
    let emailTemplate;
    try {
      emailTemplate = await fs.readFile(templatePath, 'utf8');
      console.log('Email template loaded successfully');
    } catch (err) {
      console.error('Error reading email template:', err);
      // Use a simple template if file reading fails
      emailTemplate = `
        <h1>Restablecer Contraseña</h1>
        <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
        <a href="{{resetUrl}}">Restablecer Contraseña</a>
        <p>Si no solicitaste este restablecimiento, ignora este correo.</p>
        <p>© {{currentYear}} Lighthouse Restaurant</p>
      `;
      console.log('Using fallback email template');
    }
    
    // Replace placeholders (all occurrences, with variations)
    const year = String(new Date().getFullYear());
    emailTemplate = emailTemplate
      // Common handlebars-like placeholders
      .replace(/\{\{\s*resetUrl\s*\}\}/gi, resetUrl)
      .replace(/\{\{\s*currentYear\s*\}\}/gi, year)
      // Alternate legacy placeholder sometimes found
      .replace(/\{\s*resetpassword\s*\}/gi, resetUrl);

    // Warn if placeholders still remain
    if (/\{\{\s*resetUrl\s*\}\}/i.test(emailTemplate) || /\{\s*resetpassword\s*\}/i.test(emailTemplate)) {
      console.warn('[emailService] Warning: Some reset URL placeholders remain unreplaced in the template.');
    }

    console.log('Sending email with the following details:', {
      from: `"${process.env.EMAIL_FROM_NAME || 'Lighthouse Restaurant'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Restablecer tu contraseña - Lighthouse Restaurant'
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Lighthouse Restaurant'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Restablecer tu contraseña - Lighthouse Restaurant',
      html: emailTemplate,
    });

    console.log('Password reset email sent successfully:', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    
    return { 
      success: true, 
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) // For testing with ethereal.email
    };
  } catch (error) {
    console.error('Error sending password reset email:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response,
      responseCode: error.responseCode,
      command: error.command
    });

    // Consejos específicos para EAUTH 535 (Gmail, etc.)
    if (error && error.code === 'EAUTH') {
      console.error('[emailService] Error de autenticación SMTP. Sugerencias:');
      console.error('- Si usas Gmail: habilita 2FA y usa un App Password.');
      console.error('- Verifica que EMAIL_FROM coincide con EMAIL_USER o es un alias permitido.');
      console.error('- Usa puerto 587 con EMAIL_SECURE=false (STARTTLS) o 465 con EMAIL_SECURE=true (SSL).');
    }
    return { 
      success: false, 
      error: error.message,
      details: {
        code: error.code,
        response: error.response,
        command: error.command
      }
    };
  }
}

// Function to generate and save reset token
async function generateResetToken(email) {
  try {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    const normalizedEmail = String(email).trim();
    console.log('[generateResetToken] Buscando usuario por email (case-insensitive):', normalizedEmail);

    // Find user case-insensitively
    const { data: foundUser, error: findErr } = await supabase
      .from('users')
      .select('id,email')
      .ilike('email', normalizedEmail);

    if (findErr) throw findErr;
    if (!foundUser || foundUser.length === 0) {
      throw new Error('No se encontró el usuario con ese correo electrónico');
    }

    // If multiple, pick exact lower-case match or first
    const target = foundUser.find(u => (u.email || '').toLowerCase() === normalizedEmail.toLowerCase()) || foundUser[0];
    console.log('[generateResetToken] Usuario objetivo:', target);

    // Update by id
    const { data: updated, error: updErr } = await supabase
      .from('users')
      .update({
        reset_password_token: resetToken,
        reset_password_expires: resetTokenExpiry.toISOString(),
        reset_password_used: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', target.id)
      .select('id,email')
      .single();

    if (updErr) throw updErr;
    if (!updated) throw new Error('No se pudo actualizar el token de restablecimiento');

    console.log('[generateResetToken] Token generado y guardado para:', updated.email);
    return { success: true, token: resetToken };
  } catch (error) {
    console.error('Error generating reset token:', error);
    return { success: false, error: error.message };
  }
}

// Function to verify reset token
async function verifyResetToken(token) {
  try {
    const nowIso = new Date().toISOString();
    const normalizedToken = String(token || '').trim();
    console.log('[verifyResetToken] Verificando token:', normalizedToken);

    if (!normalizedToken) {
      return { valid: false, message: 'Token no proporcionado' };
    }

    // First attempt with all conditions
    let { data: user, error } = await supabase
      .from('users')
      .select('id,email,reset_password_expires,reset_password_used')
      .eq('reset_password_token', normalizedToken)
      .eq('reset_password_used', false)
      .gt('reset_password_expires', nowIso)
      .single();

    if (error) {
      console.warn('[verifyResetToken] Query 1 falló, intentando diagnóstico sin algunas condiciones:', error?.message || error);
      // Diagnostic fallback: fetch by token only
      const byToken = await supabase
        .from('users')
        .select('id,email,reset_password_expires,reset_password_used')
        .eq('reset_password_token', normalizedToken)
        .maybeSingle();
      if (byToken.error) {
        console.error('[verifyResetToken] Error al buscar por token:', byToken.error);
        throw byToken.error;
      }
      if (!byToken.data) {
        return { valid: false, message: 'Token inválido' };
      }
      // Check expiry and used flags manually
      const expired = !byToken.data.reset_password_expires || byToken.data.reset_password_expires <= nowIso;
      const used = !!byToken.data.reset_password_used;
      console.log('[verifyResetToken] Diagnóstico token encontrado:', {
        email: byToken.data.email,
        expires: byToken.data.reset_password_expires,
        used,
        now: nowIso
      });
      if (used) return { valid: false, message: 'El enlace ya fue utilizado' };
      if (expired) return { valid: false, message: 'El enlace ha expirado' };
      user = byToken.data;
    }

    if (!user) return { valid: false, message: 'Token inválido o expirado' };

    return { valid: true, user };
  } catch (error) {
    console.error('Error verifying reset token:', {
      message: error.message,
      code: error.code,
    });
    return { valid: false, message: 'Error al verificar el token' };
  }
}

// Function to update password
async function updatePassword(userId, newPassword) {
  try {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { data, error } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        reset_password_used: true,
        reset_password_token: null,
        reset_password_expires: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    
    return { success: true, user: data };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPasswordResetEmail,
  generateResetToken,
  verifyResetToken,
  updatePassword
};
