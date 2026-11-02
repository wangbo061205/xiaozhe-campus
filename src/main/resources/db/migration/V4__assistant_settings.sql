CREATE TABLE assistant_settings (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    name VARCHAR(40) NOT NULL,
    greeting TEXT NOT NULL,
    persona_prompt TEXT NOT NULL,
    suggestions TEXT NOT NULL,
    knowledge_enabled BOOLEAN NOT NULL,
    emotional_support_enabled BOOLEAN NOT NULL,
    support_contact TEXT NOT NULL,
    support_contact_verified_at DATE
);
