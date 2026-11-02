package cn.edu.nun.campus.todo;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/todos")
public class TodoController {

    private final UserTodoRepository repo;

    public TodoController(UserTodoRepository repo) {
        this.repo = repo;
    }

    public record TodoReq(@NotBlank String title, String note,
                          String sourceType, Long sourceId,
                          OffsetDateTime dueAt, OffsetDateTime remindAt) {}

    @GetMapping
    public ApiResponse<List<UserTodo>> list() {
        return ApiResponse.ok(repo.findByUserIdOrderByCreatedAtDesc(AuthUser.currentId()));
    }

    @PostMapping
    public ApiResponse<UserTodo> create(@Valid @RequestBody TodoReq req) {
        UserTodo t = new UserTodo();
        t.setUserId(AuthUser.currentId());
        t.setTitle(req.title());
        t.setNote(req.note());
        t.setSourceType(req.sourceType());
        t.setSourceId(req.sourceId());
        t.setDueAt(req.dueAt());
        t.setRemindAt(req.remindAt());
        return ApiResponse.ok(repo.save(t));
    }

    @PostMapping("/{id}/status")
    public ApiResponse<UserTodo> changeStatus(@PathVariable Long id, @RequestParam UserTodo.Status status) {
        UserTodo t = repo.findByIdAndUserId(id, AuthUser.currentId())
                .orElseThrow(() -> BizException.notFound("待办"));
        t.setStatus(status);
        t.setUpdatedAt(OffsetDateTime.now());
        return ApiResponse.ok(repo.save(t));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        UserTodo t = repo.findByIdAndUserId(id, AuthUser.currentId())
                .orElseThrow(() -> BizException.notFound("待办"));
        repo.delete(t);
        return ApiResponse.ok();
    }
}
