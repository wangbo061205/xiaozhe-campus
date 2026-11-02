CREATE TABLE course_timetable_settings (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    term_start DATE
);
