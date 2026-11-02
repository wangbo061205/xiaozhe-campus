package cn.edu.nun.campus.lostfound;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface LostFoundImageRepository extends JpaRepository<LostFoundImage, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from LostFoundImage i where i.id in :ids order by i.id")
    List<LostFoundImage> lockAllByIds(@Param("ids") List<UUID> ids);
}
