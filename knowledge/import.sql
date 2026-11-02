\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE knowledge_seed (
    type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    summary VARCHAR(500),
    source_name VARCHAR(255),
    source_url VARCHAR(1024),
    official BOOLEAN NOT NULL,
    department VARCHAR(128),
    published_at TIMESTAMPTZ,
    effective_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,
    version INTEGER NOT NULL,
    materials JSONB,
    import_key VARCHAR(160) NOT NULL,
    source_site VARCHAR(64),
    source_category VARCHAR(255),
    imported_at TIMESTAMPTZ
) ON COMMIT DROP;

\copy knowledge_seed (type, title, content, summary, source_name, source_url, official, department, published_at, effective_at, expires_at, status, version, materials, import_key, source_site, source_category, imported_at) FROM PROGRAM 'gzip -dc /seed/official-knowledge.csv.gz' WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8')

INSERT INTO knowledge_item (
    type,
    title,
    content,
    summary,
    source_name,
    source_url,
    official,
    department,
    published_at,
    effective_at,
    expires_at,
    status,
    version,
    materials,
    import_key,
    source_site,
    source_category,
    imported_at
)
SELECT
    type,
    title,
    content,
    summary,
    source_name,
    source_url,
    official,
    department,
    published_at,
    effective_at,
    expires_at,
    status,
    version,
    materials,
    import_key,
    source_site,
    source_category,
    imported_at
FROM knowledge_seed
ON CONFLICT (import_key) DO NOTHING;

ANALYZE knowledge_item;

COMMIT;
