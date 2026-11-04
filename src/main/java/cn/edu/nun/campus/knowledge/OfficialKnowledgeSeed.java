package cn.edu.nun.campus.knowledge;

import org.postgresql.PGConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.zip.GZIPInputStream;

/** Restore the official snapshot once, before the application accepts cloud traffic. */
@Component
@ConditionalOnProperty(name = "app.knowledge.seed.enabled", havingValue = "true")
@DependsOnDatabaseInitialization
public class OfficialKnowledgeSeed implements InitializingBean {
    private static final Logger log = LoggerFactory.getLogger(OfficialKnowledgeSeed.class);
    static final String COLUMNS = "type, title, content, summary, source_name, source_url, official, "
            + "department, published_at, effective_at, expires_at, status, version, materials, "
            + "import_key, source_site, source_category, imported_at";
    static final String COUNT = "SELECT count(*) FROM knowledge_item WHERE import_key LIKE 'nmu-official:%'";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final Path seed;
    private final int expected;

    public OfficialKnowledgeSeed(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                 @Value("${app.knowledge.seed.path}") String path,
                                 @Value("${app.knowledge.seed.expected-count:8811}") int expected) {
        if (expected < 1) throw new IllegalArgumentException("知识库预期条数必须大于零");
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        this.seed = Path.of(path);
        this.expected = expected;
    }

    @Override
    public void afterPropertiesSet() {
        Long count = transaction.execute(status -> jdbc.execute((ConnectionCallback<Long>) this::restore));
        log.info("官方知识库已就绪：{} 条；已有资料和管理员编辑保持不变。", count);
    }

    private long restore(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            // Concurrent replicas use the same transaction-scoped lock; failures release it on rollback.
            statement.execute("SELECT pg_advisory_xact_lock(824724103161)");
            try (var existing = statement.executeQuery(COUNT)) {
                existing.next();
                long count = existing.getLong(1);
                if (count >= expected) return count;
            }
            statement.execute("""
                    CREATE TEMP TABLE campus_official_seed (
                        type VARCHAR(20) NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL,
                        summary VARCHAR(500), source_name VARCHAR(255), source_url VARCHAR(1024),
                        official BOOLEAN NOT NULL, department VARCHAR(128), published_at TIMESTAMPTZ,
                        effective_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, status VARCHAR(20) NOT NULL,
                        version INTEGER NOT NULL, materials JSONB, import_key VARCHAR(160) NOT NULL,
                        source_site VARCHAR(64), source_category VARCHAR(255), imported_at TIMESTAMPTZ
                    ) ON COMMIT DROP
                    """);
            try (var compressed = Files.newInputStream(seed); var input = new GZIPInputStream(compressed, 65536)) {
                long copied = connection.unwrap(PGConnection.class).getCopyAPI().copyIn(
                        "COPY campus_official_seed (" + COLUMNS + ") FROM STDIN WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8')",
                        input);
                if (copied != expected) throw new IllegalStateException("官方知识库文件条数不符，已取消导入");
            } catch (IOException failure) {
                throw new IllegalStateException("无法读取官方知识库，已取消导入；请检查部署文件", failure);
            }
            statement.executeUpdate("INSERT INTO knowledge_item (" + COLUMNS + ") SELECT " + COLUMNS
                    + " FROM campus_official_seed ON CONFLICT (import_key) DO NOTHING");
            try (var restored = statement.executeQuery(COUNT)) {
                restored.next();
                long count = restored.getLong(1);
                if (count < expected) throw new IllegalStateException("官方知识库导入不完整，已取消导入");
                return count;
            }
        }
    }
}
