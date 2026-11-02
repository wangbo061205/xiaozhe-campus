package cn.edu.nun.campus.lostfound;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LostFoundRepository extends JpaRepository<LostFound, Long> {
    List<LostFound> findByStatusOrderByCreatedAtDesc(LostFound.Status status);
    List<LostFound> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<LostFound> findAllByOrderByCreatedAtDesc();
}
