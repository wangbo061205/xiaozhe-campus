UPDATE assistant_settings
SET greeting = REPLACE(REPLACE(greeting, name, '小折'), '小北', '小折'),
    persona_prompt = REPLACE(REPLACE(persona_prompt, name, '小折'), '小北', '小折'),
    name = '小折'
WHERE id = 1 AND name <> '小折';
