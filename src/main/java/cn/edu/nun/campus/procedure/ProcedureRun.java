package cn.edu.nun.campus.procedure;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

/** 办事办理进度（PROJECT §10.2：材料勾选 + 步骤推进 + 状态跟踪） */
@Getter
@Setter
@Entity
@Table(name = "procedure_run")
public class ProcedureRun {

    public enum Status { in_progress, done, abandoned }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "knowledge_id", nullable = false)
    private Long knowledgeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.in_progress;

    /** 材料勾选 {"材料名": true} */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "material_checks", columnDefinition = "JSONB")
    private String materialChecks;

    /** 步骤完成情况 {"1": true} */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "step_progress", columnDefinition = "JSONB")
    private String stepProgress;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;
}
