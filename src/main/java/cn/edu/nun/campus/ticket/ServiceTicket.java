package cn.edu.nun.campus.ticket;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** 人工服务工单（PROJECT §10.3 转接人工，简化版：用户提交 → 工作人员处理） */
@Getter
@Setter
@Entity
@Table(name = "service_ticket")
public class ServiceTicket {

    public enum Category { ACCOUNT, COURSE, DORM, PAYMENT, OTHER }
    public enum Status { OPEN, HANDLING, RESOLVED, CLOSED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Category category = Category.OTHER;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(name = "contact_hint", length = 255)
    private String contactHint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.OPEN;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();
}
