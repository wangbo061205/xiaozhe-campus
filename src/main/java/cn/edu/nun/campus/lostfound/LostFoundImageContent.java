package cn.edu.nun.campus.lostfound;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "lost_found_image_content")
@Getter
@Setter
public class LostFoundImageContent {
    @Id
    @Column(name = "image_id")
    private UUID imageId;

    @Column(nullable = false, columnDefinition = "BYTEA")
    private byte[] data;
}
