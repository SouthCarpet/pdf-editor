CREATE TABLE ocr_hocr_cache (
  file_sha256 TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  dpi INTEGER NOT NULL,
  language TEXT NOT NULL,
  engine TEXT NOT NULL,
  hocr TEXT NOT NULL,
  pixel_width INTEGER NOT NULL,
  pixel_height INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_accessed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (file_sha256, page_index, dpi, language, engine)
);

CREATE INDEX idx_ocr_hocr_cache_lru
  ON ocr_hocr_cache(last_accessed_at_ms ASC);
