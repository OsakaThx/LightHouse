-- Site-wide settings for customizable homepage and footer
-- Note: single-row table; the app reads the first row

CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title TEXT,
  hero_subtitle TEXT,
  hero_image_url TEXT,
  historia_html TEXT,
  visitanos_html TEXT,
  schedule_json TEXT,
  address TEXT,
  map_embed_url TEXT,
  footer_html TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
