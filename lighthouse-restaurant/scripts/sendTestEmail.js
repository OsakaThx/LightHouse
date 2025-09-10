const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  const to = process.argv[2] || process.env.TEST_EMAIL_TO;
  if (!to) {
    console.error('Uso: node scripts/sendTestEmail.js destinatario@example.com');
    process.exit(1);
  }

  const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const EMAIL_PORT = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587;
  const EMAIL_SECURE = String(process.env.EMAIL_SECURE).toLowerCase() === 'true' || EMAIL_PORT === 465;
  const EMAIL_USER = process.env.EMAIL_USER;
  const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
  const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

  console.log('[sendTestEmail] Configuración efectiva:', { EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_FROM });

  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.error('[sendTestEmail] Falta EMAIL_USER o EMAIL_PASSWORD en .env');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    debug: true,
    logger: true,
  });

  try {
    await transporter.verify();
    console.log('[sendTestEmail] Conexión SMTP verificada');
  } catch (e) {
    console.error('[sendTestEmail] Falla en verify():', e);
  }

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Lighthouse Restaurant'}" <${EMAIL_FROM}>`,
      to,
      subject: 'Prueba de SMTP - Lighthouse Restaurant',
      text: 'Este es un correo de prueba para verificar la configuración SMTP.',
      html: '<p>Este es un correo de <b>prueba</b> para verificar la configuración SMTP.</p>',
    });
    console.log('[sendTestEmail] Enviado. MessageId:', info.messageId);
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log('[sendTestEmail] Preview URL:', preview);
  } catch (e) {
    console.error('[sendTestEmail] Error enviando correo:', {
      message: e.message,
      code: e.code,
      response: e.response,
      responseCode: e.responseCode,
      command: e.command,
    });
    if (e && e.code === 'EAUTH') {
      console.error('[sendTestEmail] Sugerencias:');
      console.error('- Si usas Gmail: activa 2FA y usa un App Password.');
      console.error('- Asegura que EMAIL_FROM coincide con EMAIL_USER o es un alias permitido.');
      console.error('- Usa 587 con EMAIL_SECURE=false (STARTTLS) o 465 con EMAIL_SECURE=true (SSL).');
    }
    process.exit(3);
  }
})();
