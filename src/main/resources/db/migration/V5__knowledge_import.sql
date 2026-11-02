-- Keep imported provenance separate from administrator-maintained knowledge.
ALTER TABLE knowledge_item ADD COLUMN import_key VARCHAR(160);
ALTER TABLE knowledge_item ADD COLUMN source_site VARCHAR(64);
ALTER TABLE knowledge_item ADD COLUMN source_category VARCHAR(255);
ALTER TABLE knowledge_item ADD COLUMN imported_at TIMESTAMPTZ;

CREATE UNIQUE INDEX uq_knowledge_import_key ON knowledge_item (import_key);
CREATE INDEX idx_knowledge_source_category ON knowledge_item (source_site, source_category);
CREATE INDEX idx_knowledge_published_date ON knowledge_item (status, published_at DESC NULLS LAST, id DESC);
