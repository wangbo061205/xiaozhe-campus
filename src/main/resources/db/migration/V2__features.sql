-- V2: 补齐方案 md 的缺失功能（无需校内授权即可运行的部分）
-- 个人收藏 / 办事指南材料清单 / 课表（手动录入初步）/ 人工工单 / 类别订阅

-- ========== 1. 个人收藏（P1：个人收藏、待办和通知提醒） ==========
CREATE TABLE user_favorite (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    knowledge_id BIGINT NOT NULL REFERENCES knowledge_item(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, knowledge_id)
);
CREATE INDEX idx_favorite_user ON user_favorite (user_id);

-- ========== 2. 办事指南材料清单（4.4：所需材料结构化） ==========
ALTER TABLE knowledge_item ADD COLUMN materials JSONB;

-- ========== 3. 课表（4.10 基础阶段：用户手动录入） ==========
CREATE TABLE course (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    name       VARCHAR(128) NOT NULL,
    teacher    VARCHAR(64),
    location   VARCHAR(128),
    weekday    INT NOT NULL,             -- 1=周一 ... 7=周日
    start_sect INT NOT NULL,             -- 起始节次（1-12）
    end_sect   INT NOT NULL,             -- 结束节次
    weeks      VARCHAR(64),              -- 如 "1-16"（选填）
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_user ON course (user_id, weekday, start_sect);

-- ========== 4. 人工服务工单（5.4 人工转接 / 9.1 工单） ==========
CREATE TABLE service_ticket (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    -- ACCOUNT / COURSE / DORM / PAYMENT / OTHER
    category     VARCHAR(30) NOT NULL DEFAULT 'OTHER',
    title        VARCHAR(255) NOT NULL,
    detail       TEXT,
    contact_hint VARCHAR(255),
    -- OPEN / HANDLING / RESOLVED / CLOSED
    status       VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_user ON service_ticket (user_id, status);
CREATE INDEX idx_ticket_status ON service_ticket (status);

-- ========== 5. 类别订阅（4.3：按类别订阅通知） ==========
CREATE TABLE user_subscription (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    -- NOTICE / POLICY / GUIDE / FAQ
    type       VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, type)
);

-- ========== 6. 办事办理进度（PROJECT §10.2：带着用户把事办完） ==========
CREATE TABLE procedure_run (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    knowledge_id    BIGINT NOT NULL REFERENCES knowledge_item(id),
    -- in_progress / done / abandoned
    status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    material_checks JSONB,               -- {"已勾选材料名": true}
    step_progress   JSONB,               -- {"已完成步骤序号": true}
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_procedure_run_user ON procedure_run (user_id, status);
