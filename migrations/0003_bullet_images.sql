-- Migration: Add image support to bullets (one image per bullet)
ALTER TABLE bullets ADD COLUMN image_key TEXT;
ALTER TABLE bullets ADD COLUMN image_url TEXT;
