package cn.edu.nun.campus.subscription;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** 类别订阅（按通知/政策/指南/FAQ 类别订阅，站内版） */
@Getter
@Setter
@Entity
@Table(name = "user_subscription", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "type"}))
public class UserSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 20)
    private String type;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
