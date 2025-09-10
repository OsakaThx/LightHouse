const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { checkAuthenticated, checkNotAuthenticated } = require('../middleware/auth');
const { 
  sendPasswordResetEmail, 
  generateResetToken, 
  verifyResetToken, 
  updatePassword 
} = require('../utils/emailService');

// Forgot Password - Show form
router.get('/forgot-password', checkNotAuthenticated, (req, res) => {
  res.render('auth/forgot-password', { 
    title: '¿Olvidaste tu contraseña?',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// Process Forgot Password
router.post('/forgot-password', checkNotAuthenticated, async (req, res) => {
  console.log('\n=== Forgot Password Request ===');
  console.log('Request body:', req.body);
  
  try {
    const { email } = req.body;
    
    if (!email) {
      console.log('No email provided');
      req.flash('error', 'Por favor ingresa tu correo electrónico');
      return res.redirect('/auth/forgot-password');
    }

    console.log('Generating reset token for email:', email);
    
    // Generate reset token and send email
    const tokenResult = await generateResetToken(email);
    const { success, error, token } = tokenResult;
    
    console.log('Token generation result:', { success, error: error ? error : 'No error', token: token ? 'Token generated' : 'No token' });
    
    if (!success) {
      console.error('Error generating reset token:', error);
      // Don't reveal if the email exists or not for security reasons
      req.flash('success', 'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.');
      return res.redirect('/auth/forgot-password');
    }

    console.log('Sending password reset email...');
    const emailResult = await sendPasswordResetEmail(email, token);
    console.log('Email sending result:', {
      success: emailResult.success,
      messageId: emailResult.messageId,
      error: emailResult.error,
      previewUrl: emailResult.previewUrl
    });
    
    if (emailResult.previewUrl) {
      console.log('Preview email at:', emailResult.previewUrl);
    }
    
    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error, emailResult.details || '');
      req.flash('error', 'No se pudo enviar el correo de restablecimiento. Verifica el correo o inténtalo más tarde.');
      return res.redirect('/auth/forgot-password');
    }

    req.flash('success', 'Se ha enviado un correo con las instrucciones para restablecer tu contraseña.');
    return res.redirect('/auth/forgot-password');
  } catch (error) {
    console.error('Error in forgot password:', error);
    req.flash('error', 'Ocurrió un error al procesar tu solicitud');
    res.redirect('/auth/forgot-password');
  }
});

// Reset Password - Show form
router.get('/reset-password', checkNotAuthenticated, async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    req.flash('error', 'Enlace de restablecimiento inválido o expirado');
    return res.redirect('/auth/forgot-password');
  }

  // Verify token
  const { valid, message } = await verifyResetToken(token);
  
  if (!valid) {
    req.flash('error', message || 'Enlace de restablecimiento inválido o expirado');
    return res.redirect('/auth/forgot-password');
  }

  res.render('auth/reset-password', { 
    title: 'Restablecer Contraseña',
    token,
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// Process Reset Password
router.post('/reset-password', checkNotAuthenticated, async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  
  try {
    // Validate input
    if (!token) {
      req.flash('error', 'Token de restablecimiento no proporcionado');
      return res.redirect('/auth/forgot-password');
    }

    if (!password || !confirmPassword) {
      req.flash('error', 'Por favor completa todos los campos');
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Las contraseñas no coinciden');
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    if (password.length < 8) {
      req.flash('error', 'La contraseña debe tener al menos 8 caracteres');
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    // Verify token again before updating password
    const { valid, user, message } = await verifyResetToken(token);
    
    if (!valid || !user) {
      req.flash('error', message || 'Enlace de restablecimiento inválido o expirado');
      return res.redirect('/auth/forgot-password');
    }

    // Update password
    const { success, error } = await updatePassword(user.id, password);
    
    if (!success) {
      console.error('Error updating password:', error);
      req.flash('error', 'Error al actualizar la contraseña');
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    // Password updated successfully
    req.flash('success', '¡Tu contraseña ha sido actualizada correctamente! Ahora puedes iniciar sesión con tu nueva contraseña.');
    res.redirect('/admin/login');
  } catch (error) {
    console.error('Error in reset password:', error);
    req.flash('error', 'Ocurrió un error al restablecer tu contraseña');
    res.redirect(`/auth/reset-password?token=${token}`);
  }
});

// Login routes (moved from admin.js)
router.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('admin/login', { 
    title: 'Iniciar Sesión - Administrador',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    console.log('\n=== Login Attempt ===');
    console.log('Email:', email);
    
    // Validate input
    if (!email || !password) {
      req.flash('error', 'Por favor ingresa tu correo y contraseña');
      return res.redirect('/auth/login');
    }
    
    // Get user from database
    const { data: user, error } = await req.app.locals.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      console.error('User not found or error:', error);
      req.flash('error', 'Credenciales inválidas');
      return res.redirect('/auth/login');
    }
    
    // Check if user is admin
    if (!user.is_admin) {
      console.log('User is not an admin:', email);
      req.flash('error', 'No tienes permisos para acceder al panel de administración');
      return res.redirect('/auth/login');
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('Invalid password for user:', email);
      req.flash('error', 'Credenciales inválidas');
      return res.redirect('/auth/login');
    }
    
    // Update last login time
    await req.app.locals.supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);
    
    // Set user in session
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.is_admin
    };
    
    console.log('Login successful for user:', user.email);
    
    // Redirect to admin dashboard
    req.session.save(err => {
      if (err) {
        console.error('Error saving session:', err);
        req.flash('error', 'Error al iniciar sesión');
        return res.redirect('/auth/login');
      }
      res.redirect('/admin');
    });
    
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Error al iniciar sesión');
    res.redirect('/auth/login');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;
