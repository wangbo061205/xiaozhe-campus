package cn.edu.nun.campus.ticket;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

/** 人工服务工单：用户提交求助，管理员/工作人员处理 */
@RestController
@RequestMapping("/api/v1")
public class TicketController {

    public record TicketReq(@NotNull ServiceTicket.Category category, @NotBlank String title,
                            String detail, String contactHint) {}

    private final TicketRepository repo;

    public TicketController(TicketRepository repo) {
        this.repo = repo;
    }

    @PostMapping("/tickets")
    public ApiResponse<ServiceTicket> create(@Valid @RequestBody TicketReq req) {
        ServiceTicket t = new ServiceTicket();
        t.setUserId(AuthUser.currentId());
        t.setCategory(req.category());
        t.setTitle(req.title().trim());
        t.setDetail(req.detail());
        t.setContactHint(req.contactHint());
        return ApiResponse.ok(repo.save(t));
    }

    @GetMapping("/tickets/mine")
    public ApiResponse<List<ServiceTicket>> mine() {
        return ApiResponse.ok(repo.findByUserIdOrderByCreatedAtDesc(AuthUser.currentId()));
    }

    // ===== 管理端 =====

    @GetMapping("/admin/tickets")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<List<ServiceTicket>> all(@RequestParam(required = false) String status) {
        if (status == null || status.isBlank()) {
            return ApiResponse.ok(repo.findAllByOrderByCreatedAtDesc());
        }
        return ApiResponse.ok(repo.findByStatusOrderByCreatedAtDesc(parseStatus(status)));
    }

    @PostMapping("/admin/tickets/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<ServiceTicket> changeStatus(@PathVariable Long id, @RequestParam String status) {
        ServiceTicket t = repo.findById(id).orElseThrow(() -> BizException.notFound("工单"));
        t.setStatus(parseStatus(status));
        t.setUpdatedAt(OffsetDateTime.now());
        return ApiResponse.ok(repo.save(t));
    }

    /** 宽松解析工单状态，非法值返回 400 而不是 500 */
    private static ServiceTicket.Status parseStatus(String raw) {
        try {
            return ServiceTicket.Status.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw BizException.badRequest("工单状态不合法：" + raw
                    + "，可选值 " + java.util.Arrays.toString(ServiceTicket.Status.values()));
        }
    }
}

@Repository
interface TicketRepository extends JpaRepository<ServiceTicket, Long> {
    List<ServiceTicket> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<ServiceTicket> findAllByOrderByCreatedAtDesc();
    List<ServiceTicket> findByStatusOrderByCreatedAtDesc(ServiceTicket.Status status);
}
