-- 北方民族大学校园 Agent 首期数据库结构
-- PostgreSQL 14+，PostGIS 可选（地点模块启用时）

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ========== 用户与角色 ==========
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    display_name  VARCHAR(64)  NOT NULL,
    -- GUEST / STUDENT / TEACHER / STAFF / MODERATOR / ADMIN / AUDITOR
    role          VARCHAR(20)  NOT NULL DEFAULT 'STUDENT',
    enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ========== 知识库 ==========
-- 统一承载通知、政策、办事指南、部门信息、FAQ
CREATE TABLE knowledge_item (
    id           BIGSERIAL PRIMARY KEY,
    -- NOTICE / POLICY / GUIDE / DEPARTMENT / PLACE / SERVICE / FAQ
    type         VARCHAR(20)   NOT NULL,
    title        VARCHAR(255)  NOT NULL,
    content      TEXT          NOT NULL,
    summary      VARCHAR(500),
    source_name  VARCHAR(255),          -- 来源名称
    source_url   VARCHAR(1024),         -- 原文链接
    official     BOOLEAN NOT NULL DEFAULT FALSE, -- 是否正式来源
    department   VARCHAR(128),          -- 责任部门
    published_at TIMESTAMPTZ,           -- 发布时间
    effective_at TIMESTAMPTZ,           -- 生效时间
    expires_at   TIMESTAMPTZ,           -- 过期时间
    -- DRAFT / PENDING_REVIEW / PUBLISHED / EXPIRED / ARCHIVED
    status       VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    version      INT           NOT NULL DEFAULT 1,
    created_by   BIGINT REFERENCES users(id),
    reviewed_by  BIGINT REFERENCES users(id),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    search_tsv   TSVECTOR
);

CREATE INDEX idx_knowledge_tsv    ON knowledge_item USING GIN (search_tsv);
CREATE INDEX idx_knowledge_type   ON knowledge_item (type, status);
CREATE INDEX idx_knowledge_title_trgm ON knowledge_item USING GIN (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION knowledge_item_tsv_update() RETURNS trigger AS $$
BEGIN
    NEW.search_tsv :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'C');
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_tsv
BEFORE INSERT OR UPDATE OF title, summary, content ON knowledge_item
FOR EACH ROW EXECUTE FUNCTION knowledge_item_tsv_update();

-- ========== 办事指南（结构化） ==========
CREATE TABLE service_guide (
    id            BIGSERIAL PRIMARY KEY,
    knowledge_id  BIGINT UNIQUE REFERENCES knowledge_item(id),
    applicable_to VARCHAR(255),          -- 适用对象
    conditions    TEXT,                  -- 办理条件 (JSON 数组)
    materials     TEXT,                  -- 所需材料 (JSON 数组)
    steps         TEXT,                  -- 办理步骤 (JSON 数组)
    location      VARCHAR(255),
    office_hours  VARCHAR(255),
    contact       VARCHAR(255),
    entry_url     VARCHAR(1024),         -- 官方办理入口
    faq           TEXT                   -- 常见问题 (JSON 数组)
);

-- ========== 用户订阅 / 收藏 / 待办 ==========
CREATE TABLE user_todo (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    title        VARCHAR(255) NOT NULL,
    note         TEXT,
    source_type  VARCHAR(20),            -- 关联来源类型（如 NOTICE）
    source_id    BIGINT,
    due_at       TIMESTAMPTZ,
    remind_at    TIMESTAMPTZ,
    -- OPEN / DONE / CANCELLED
    status       VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_todo_user ON user_todo (user_id, status);

-- ========== Agent 任务 ==========
CREATE TABLE agent_task (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    goal         TEXT NOT NULL,           -- 用户目标
    -- draft / need_input / ready_for_review / confirmed / in_progress
    -- / completed / failed / needs_human / cancelled
    status       VARCHAR(30) NOT NULL DEFAULT 'draft',
    risk_level   VARCHAR(10) NOT NULL DEFAULT 'LOW',  -- LOW / MEDIUM / HIGH
    context      JSONB,                   -- 任务上下文与步骤记录
    result       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_task_user ON agent_task (user_id, status);

-- ========== Agent 工具调用审计 ==========
CREATE TABLE agent_tool_call (
    id          BIGSERIAL PRIMARY KEY,
    task_id     BIGINT REFERENCES agent_task(id),
    user_id     BIGINT NOT NULL REFERENCES users(id),
    tool_name   VARCHAR(64) NOT NULL,
    params      JSONB,
    success     BOOLEAN NOT NULL,
    error       TEXT,
    duration_ms INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tool_call_task ON agent_tool_call (task_id);

-- ========== 失物招领 ==========
CREATE TABLE lost_found (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    -- LOST / FOUND
    kind        VARCHAR(10) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(64),
    description TEXT,
    location    VARCHAR(255),
    happened_at TIMESTAMPTZ,
    images      JSONB,                   -- 对象存储 key 列表
    -- PENDING_REVIEW / PUBLISHED / CLAIMED / CLOSED / REMOVED
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
    contact_hint VARCHAR(255),           -- 站内联系优先；不存明文手机号
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lost_found_status ON lost_found (status, kind);

-- ========== 用户反馈 / 知识缺口 ==========
CREATE TABLE feedback (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id),
    -- USEFUL / USELESS / ERROR_REPORT / MISSING_CONTENT / OTHER
    type        VARCHAR(30) NOT NULL,
    target_type VARCHAR(30),             -- 针对的对象类型
    target_id   BIGINT,
    content     TEXT,
    -- OPEN / IN_PROGRESS / RESOLVED / CLOSED
    status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== 模型调用与成本 ==========
CREATE TABLE llm_usage (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT REFERENCES users(id),
    provider       VARCHAR(32) NOT NULL,
    model          VARCHAR(64) NOT NULL,
    prompt_tokens  INT NOT NULL DEFAULT 0,
    output_tokens  INT NOT NULL DEFAULT 0,
    cost_cny       NUMERIC(10,6) NOT NULL DEFAULT 0,
    latency_ms     INT,
    success        BOOLEAN NOT NULL,
    purpose        VARCHAR(64),          -- chat / search_answer / draft ...
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_llm_usage_time ON llm_usage (created_at);

-- ========== 安全审计日志 ==========
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT,
    action     VARCHAR(64) NOT NULL,     -- LOGIN / PERMISSION_DENIED / TOOL_CALL / HIGH_RISK_CONFIRM ...
    detail     JSONB,
    ip         VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_time ON audit_log (created_at);

-- ========== 初始管理员（密码：admin123，仅限本地开发，上线必须修改） ==========
-- bcrypt(admin123)
INSERT INTO users (username, password_hash, display_name, role)
VALUES ('admin', '$2b$10$OCm.jWasxE61hB/cijXA1.KIlJN9NX7MrOFPyA1ZUqnTT80kwWO1i', '系统管理员', 'ADMIN');
