COPY (
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
    FROM knowledge_item
    WHERE import_key LIKE 'nmu-official:%'
    ORDER BY id
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');
