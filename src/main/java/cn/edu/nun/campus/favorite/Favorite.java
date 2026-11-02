package cn.edu.nun.campus.favorite;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** 个人收藏（PROJECT §11.1：个人数据仅本人可见） */
@Getter
@Setter
@Entity
@Table(name = "user_favorite", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "knowledge_id"}))
public class Favorite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "knowledge_id", nullable = false)
    private Long knowledgeId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
