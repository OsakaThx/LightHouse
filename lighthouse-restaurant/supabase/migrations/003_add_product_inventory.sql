-- Add product inventory fields
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(64);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0 NOT NULL;

-- Optional index for SKU lookups
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
