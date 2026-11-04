-- 无状态云容器可将图片像素保存在 PostgreSQL，重启或扩容时仍可读取。
-- 原文件模式继续可用；此迁移不删除或改写已有图片。
CREATE TABLE lost_found_image_content (
    image_id UUID PRIMARY KEY REFERENCES lost_found_image(id) ON DELETE CASCADE,
    data BYTEA NOT NULL
);
