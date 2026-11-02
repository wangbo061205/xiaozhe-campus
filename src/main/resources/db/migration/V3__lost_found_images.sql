CREATE TABLE lost_found_image (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    lost_found_id BIGINT REFERENCES lost_found(id),
    storage_key VARCHAR(100) NOT NULL UNIQUE,
    content_type VARCHAR(32) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lost_found_image_owner ON lost_found_image(user_id, created_at);
CREATE INDEX idx_lost_found_image_post ON lost_found_image(lost_found_id);
