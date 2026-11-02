package cn.edu.nun.campus.audit;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AuditService {

    private final AuditLogRepository repo;

    public AuditService(AuditLogRepository repo) {
        this.repo = repo;
    }

    public void record(Long userId, String action, String detailJson) {
        try {
            AuditLog l = new AuditLog();
            l.setUserId(userId);
            l.setAction(action);
            l.setDetail(detailJson);
            repo.save(l);
        } catch (Exception e) {
            log.error("审计日志写入失败 action={}", action, e);
        }
    }
}

@Repository
interface AuditLogRepository extends JpaRepository<AuditLog, Long> {}
