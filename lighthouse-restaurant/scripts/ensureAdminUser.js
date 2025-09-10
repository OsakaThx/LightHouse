const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const name = process.argv[4] || 'Administrador';

  if (!email || !password) {
    console.error('Uso: node scripts/ensureAdminUser.js correo@example.com password [Nombre]');
    process.exit(1);
  }

  try {
    const { data: existing, error: selError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (selError) throw selError;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (!existing) {
      const { data, error } = await supabase
        .from('users')
        .insert([{
          email,
          password: hashedPassword,
          name,
          is_admin: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      console.log('[ensureAdminUser] Usuario admin creado:', { id: data.id, email: data.email });
      process.exit(0);
    } else {
      const { data, error } = await supabase
        .from('users')
        .update({
          password: hashedPassword,
          name,
          is_admin: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      console.log('[ensureAdminUser] Usuario admin actualizado:', { id: data.id, email: data.email });
      process.exit(0);
    }
  } catch (e) {
    console.error('[ensureAdminUser] Error:', e);
    process.exit(2);
  }
})();
