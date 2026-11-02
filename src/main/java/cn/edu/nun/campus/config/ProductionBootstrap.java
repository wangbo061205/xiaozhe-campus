package cn.edu.nun.campus.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Validate deployment secrets and replace the development administrator before serving traffic. */
@Component
@Profile("production")
@DependsOnDatabaseInitialization
public class ProductionBootstrap implements InitializingBean {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final String jwtSecret;
    private final String databasePassword;
    private final String administratorPassword;

    public ProductionBootstrap(JdbcTemplate jdbc, PasswordEncoder encoder,
                               @Value("${app.jwt.secret}") String jwtSecret,
                               @Value("${spring.datasource.password}") String databasePassword,
                               @Value("${APP_ADMIN_PASSWORD:}") String administratorPassword) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.jwtSecret = jwtSecret;
        this.databasePassword = databasePassword;
        this.administratorPassword = administratorPassword;
    }

    @Override
    public void afterPropertiesSet() {
        if (jwtSecret.length() < 48 || jwtSecret.startsWith("please-change-me")) {
            throw new IllegalStateException("生产环境必须设置至少 48 位的随机 JWT_SECRET");
        }
        if (databasePassword.length() < 20 || "campus_dev_pwd".equals(databasePassword)) {
            throw new IllegalStateException("生产环境必须设置独立的数据库密码");
        }
        if (administratorPassword.length() < 16 || administratorPassword.length() > 64
                || "admin123".equals(administratorPassword)) {
            throw new IllegalStateException("生产环境必须设置 16 至 64 位的 APP_ADMIN_PASSWORD");
        }
        var administrators = jdbc.queryForList("SELECT id, password_hash FROM users WHERE username = 'admin' AND role = 'ADMIN'");
        for (var administrator : administrators) {
            String hash = String.valueOf(administrator.get("password_hash"));
            // Imported administrators with their own passwords keep their existing credentials.
            if (encoder.matches("admin123", hash)) {
                jdbc.update("UPDATE users SET password_hash = ?, updated_at = now() WHERE id = ? AND password_hash = ?",
                        encoder.encode(administratorPassword), administrator.get("id"), hash);
            }
        }
    }
}
