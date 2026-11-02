package cn.edu.nun.campus.lostfound;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "lost_found_image")
@Getter
@Setter
public class LostFoundImage {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "lost_found_id") private Long lostFoundId;
    @Column(name = "storage_key", nullable = false, length = 100) private String storageKey;
    @Column(name = "content_type", nullable = false, length = 32) private String contentType;
    @Column(nullable = false) private int width;
    @Column(nullable = false) private int height;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt = OffsetDateTime.now();
}
