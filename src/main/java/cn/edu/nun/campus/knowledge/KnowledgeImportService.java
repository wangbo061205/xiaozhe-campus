package cn.edu.nun.campus.knowledge;

import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Bounded batches preserve source dates and never replace an administrator's edits. */
@Service
public class KnowledgeImportService {
    public record Article(
            @NotBlank @Pattern(regexp = "[0-9a-f]{64}") String externalKey,
            @NotNull KnowledgeItem.Type type,
            @NotBlank @Size(max = 255) String title,
            @NotBlank @Size(max = 300000) String content,
            @Size(max = 500) String summary,
            @NotBlank @Size(max = 255) String sourceName,
            @NotBlank @Size(max = 1024) String sourceUrl,
            @NotNull @AssertTrue Boolean official,
            @Size(max = 128) String department,
            @NotBlank @Size(max = 64) String sourceSite,
            @NotBlank @Size(max = 255) String sourceCategory,
            OffsetDateTime publishedAt) {}

    public record Batch(
            @NotBlank @Size(max = 64) @Pattern(regexp = "[a-z0-9][a-z0-9_-]*") String dataset,
            @NotNull @Size(min = 1, max = 100) List<@NotNull @Valid Article> items) {}

    public record Result(int created, int skipped, List<Long> ids) {}

    private static final String INSERT = """
            INSERT INTO knowledge_item
                (import_key, type, title, content, summary, source_name, source_url, official,
                 department, source_site, source_category, published_at, imported_at,
                 status, version, created_by, reviewed_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING
            """;

    private final JdbcTemplate jdbc;
    private final Validator validator;

    public KnowledgeImportService(JdbcTemplate jdbc, Validator validator) {
        this.jdbc = jdbc;
        this.validator = validator;
    }

    @Transactional
    public Result importBatch(Batch batch, Long administratorId) {
        if (administratorId == null) throw BizException.forbidden("请使用管理员会话导入知识库");
        if (batch == null || !validator.validate(batch).isEmpty()) {
            throw BizException.badRequest("导入参数不合法，每批需要 1–100 篇且字段长度必须符合要求");
        }
        // Check the complete batch before making the first write. Nothing is fetched from these URLs.
        for (Article article : batch.items()) validateSource(article.sourceUrl());
        int created = 0;
        List<Long> ids = new ArrayList<>(batch.items().size());
        OffsetDateTime now = OffsetDateTime.now();
        try {
            for (Article article : batch.items()) {
                String key = batch.dataset() + ":" + article.externalKey();
                created += jdbc.update(INSERT, key, article.type().name(), article.title(),
                        article.content(), article.summary(), article.sourceName(), article.sourceUrl(),
                        article.official(), article.department(), article.sourceSite(), article.sourceCategory(),
                        article.publishedAt(), now, administratorId, administratorId, now, now);
                ids.add(jdbc.queryForObject("SELECT id FROM knowledge_item WHERE import_key = ?", Long.class, key));
            }
        } catch (DataAccessException failure) {
            // Do not include SQL parameters or the source text in the response or application log.
            throw new BizException(500, "导入失败，本批次未写入，请稍后重试");
        }
        return new Result(created, batch.items().size() - created, List.copyOf(ids));
    }

    private static void validateSource(String sourceUrl) {
        try {
            URI uri = URI.create(sourceUrl);
            String host = uri.getHost();
            String scheme = uri.getScheme();
            if (host == null || scheme == null || uri.getRawUserInfo() != null
                    || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                throw new IllegalArgumentException();
            }
            host = host.toLowerCase(Locale.ROOT);
            if (!(host.equals("nmu.edu.cn") || host.endsWith(".nmu.edu.cn"))) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException failure) {
            throw BizException.badRequest("导入来源必须是北方民族大学官网的 HTTP 或 HTTPS 链接");
        }
    }
}
