const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { generateResetToken, sendPasswordResetEmail } = require('../utils/emailService');

(async () => {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) {
    console.error('Uso: node scripts/manualForgot.js correo@example.com');
    process.exit(1);
  }
  console.log('[manualForgot] Iniciando flujo Forgot Password para:', email);
  const tokenRes = await generateResetToken(email);
  console.log('[manualForgot] Resultado generateResetToken:', tokenRes);
  if (!tokenRes.success || !tokenRes.token) {
    console.error('[manualForgot] No se pudo generar token. Abortando.');
    process.exit(2);
  }
  const emailRes = await sendPasswordResetEmail(email, tokenRes.token);
  console.log('[manualForgot] Resultado sendPasswordResetEmail:', emailRes);
  if (!emailRes.success) {
    console.error('[manualForgot] Error enviando correo:', emailRes);
    process.exit(3);
  }
  console.log('[manualForgot] Ok. Revisa tu bandeja.');
})();
