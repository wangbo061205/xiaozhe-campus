package cn.edu.nun.campus.knowledge;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Getter
@Setter
@Entity
@Table(name = "knowledge_item")
public class KnowledgeItem {

    public enum Type { NOTICE, POLICY, GUIDE, DEPARTMENT, PLACE, SERVICE, FAQ }
    public enum Status { DRAFT, PENDING_REVIEW, PUBLISHED, EXPIRED, ARCHIVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(length = 500)
    private String summary;

    @Column(name = "source_name")
    private String sourceName;

    @Column(name = "source_url", length = 1024)
    private String sourceUrl;

    @Column(name = "import_key", length = 160, unique = true)
    private String importKey;

    @Column(name = "source_site", length = 64)
    private String sourceSite;

    @Column(name = "source_category", length = 255)
    private String sourceCategory;

    @Column(name = "imported_at")
    private OffsetDateTime importedAt;

    @Column(nullable = false)
    private boolean official = false;

    private String department;

    /** 办事指南材料清单（JSON 字符串数组；仅 GUIDE 类使用） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "JSONB")
    private String materials;

    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    @Column(name = "effective_at")
    private OffsetDateTime effectiveAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.DRAFT;

    @Column(nullable = false)
    private int version = 1;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    /** 展示用：是否已过期（含 expires_at 已过） */
    public boolean isExpired() {
        return status == Status.EXPIRED
                || (expiresAt != null && expiresAt.isBefore(OffsetDateTime.now()));
    }
}
