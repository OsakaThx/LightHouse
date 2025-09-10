const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  try {
    const query = `
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'users'
        and column_name in ('reset_password_token','reset_password_expires','reset_password_used')
      order by column_name;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql: query });
    if (error) throw error;
    console.log('[checkResetColumns] Columnas encontradas:', data);
  } catch (e) {
    // Si no existe la función exec_sql, probamos seleccionando directo de information_schema con RLS off (service role)
    try {
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'users')
        .in('column_name', ['reset_password_token','reset_password_expires','reset_password_used']);
      if (error) throw error;
      console.log('[checkResetColumns] Columnas encontradas (fallback):', data.map(r => r.column_name));
    } catch (e2) {
      console.error('[checkResetColumns] Error:', e2);
      process.exit(2);
    }
  }
})();
