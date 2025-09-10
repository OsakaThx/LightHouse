const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) {
    console.error('Uso: node scripts/checkUserExists.js correo@example.com');
    process.exit(1);
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('email', email);
    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('[checkUserExists] No existe usuario con email:', email);
      process.exit(2);
    }
    console.log('[checkUserExists] Usuario encontrado:', data.map(u => ({ id: u.id, email: u.email, is_admin: u.is_admin })));
    process.exit(0);
  } catch (e) {
    console.error('[checkUserExists] Error:', e);
    process.exit(3);
  }
})();
