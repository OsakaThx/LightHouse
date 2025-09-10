const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT_BUCKET = process.env.STORAGE_BUCKET || 'lighthouse-assets';

async function ensureBucket(bucketName = DEFAULT_BUCKET) {
  try {
    // Check if bucket exists
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) throw listErr;
    const exists = (buckets || []).some(b => b.name === bucketName);
    if (exists) return { ok: true, bucket: bucketName, created: false };

    // Create bucket (public)
    const { data: created, error: createErr } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: '10MB',
    });
    if (createErr) throw createErr;
    return { ok: true, bucket: created.name, created: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function uploadImage({ file, folder = 'products', bucketName = DEFAULT_BUCKET }) {
  if (!file || !file.buffer) {
    return { ok: false, error: 'Archivo de imagen no proporcionado' };
  }
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '_');
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const base = path.basename(file.originalname || 'image', ext).replace(/[^a-z0-9_-]/gi, '_');
  const filePath = `${safeFolder}/${Date.now()}_${base}${ext}`;

  // Ensure bucket exists
  const ensured = await ensureBucket(bucketName);
  if (!ensured.ok) return { ok: false, error: ensured.error };

  // Upload to storage
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype || 'image/jpeg',
      upsert: false,
    });
  if (error) return { ok: false, error: error.message };

  // Get public URL
  const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  return { ok: true, path: data.path, url: pub.publicUrl };
}

async function listFolder(folder = '', bucketName = DEFAULT_BUCKET) {
  try {
    const safeFolder = folder.replace(/^\/+|\/+$/g, '');
    const { data, error } = await supabase.storage.from(bucketName).list(safeFolder || undefined, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) return { ok: false, error: error.message };
    const files = (data || []).filter(it => it.id || it.name).map(it => {
      const path = safeFolder ? `${safeFolder}/${it.name}` : it.name;
      const { data: pub } = supabase.storage.from(bucketName).getPublicUrl(path);
      return { name: it.name, path, url: pub.publicUrl, metadata: it };
    });
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  ensureBucket,
  uploadImage,
  listFolder,
  async deleteFile(path, bucketName = DEFAULT_BUCKET) {
    try {
      const { error } = await supabase.storage.from(bucketName).remove([path]);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
