const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const name = process.argv[2] || 'Producto de Diagnóstico';
  const price = parseFloat(process.argv[3] || '9.99');

  console.log('[diagInsertProduct] Inserting product with:', { name, price });

  try {
    const payload = {
      name,
      description: 'Inserción de prueba para diagnóstico',
      price,
      // category_id puede ser null
      is_featured: false,
      is_available: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Intentar insertar
    const { data, error } = await admin.from('products').insert([payload]).select('*');
    if (error) {
      console.error('[diagInsertProduct] Insert error:', error);
      // Intentar obtener más contexto: tabla y columnas
      const cols = await admin
        .from('information_schema.columns')
        .select('column_name, is_nullable, data_type')
        .eq('table_schema', 'public')
        .eq('table_name', 'products');
      if (cols.error) {
        console.error('[diagInsertProduct] Could not fetch columns:', cols.error);
      } else {
        console.log('[diagInsertProduct] products columns:', cols.data);
      }
      process.exit(2);
    }

    console.log('[diagInsertProduct] Inserted:', data);
    process.exit(0);
  } catch (e) {
    console.error('[diagInsertProduct] Unexpected error:', e);
    process.exit(3);
  }
})();
