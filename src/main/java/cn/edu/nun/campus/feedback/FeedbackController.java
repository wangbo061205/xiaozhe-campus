package cn.edu.nun.campus.feedback;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {

    private final FeedbackRepository repo;

    public FeedbackController(FeedbackRepository repo) {
        this.repo = repo;
    }

    public record FeedbackReq(@NotNull Feedback.Type type, String targetType, Long targetId, String content) {}

    /** 游客也可提交反馈（userId 可能为 null） */
    @PostMapping
    public ApiResponse<Feedback> submit(@Valid @RequestBody FeedbackReq req) {
        Feedback f = new Feedback();
        f.setUserId(AuthUser.currentId());
        f.setType(req.type());
        f.setTargetType(req.targetType());
        f.setTargetId(req.targetId());
        f.setContent(req.content());
        return ApiResponse.ok(repo.save(f));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<List<Feedback>> listAll() {
        return ApiResponse.ok(repo.findAll());
    }
}

@Repository
interface FeedbackRepository extends JpaRepository<Feedback, Long> {}
