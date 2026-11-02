package cn.edu.nun.campus.lostfound;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Getter
@Setter
@Entity
@Table(name = "lost_found")
public class LostFound {

    public enum Kind { LOST, FOUND }
    public enum Status { PENDING_REVIEW, PUBLISHED, CLAIMED, CLOSED, REMOVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Kind kind;

    @Column(nullable = false)
    private String title;

    @Column(length = 64)
    private String category;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String location;

    @Column(name = "happened_at")
    private OffsetDateTime happenedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "JSONB")
    private String images;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING_REVIEW;

    @Column(name = "contact_hint")
    private String contactHint;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();
}
