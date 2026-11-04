package cn.edu.nun.campus.lostfound;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface LostFoundImageContentRepository extends JpaRepository<LostFoundImageContent, UUID> {}
