package cn.edu.nun.campus.lostfound;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.io.IOException;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/v1/lost-found")
public class LostFoundController {

    /** 敏感信息粗筛：身份证/手机号/银行卡号不允许出现在公开描述中 */
    private static final Pattern SENSITIVE = Pattern.compile(
            "\\d{17}[\\dXx]|1[3-9]\\d{9}|\\d{16,19}");

    private final LostFoundRepository repo;
    private final LostFoundImageService imageService;

    public LostFoundController(LostFoundRepository repo, LostFoundImageService imageService) {
        this.repo = repo;
        this.imageService = imageService;
    }

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> invalidImageOrPost(BizException error) {
        return ResponseEntity.status(error.getCode()).body(ApiResponse.error(error.getCode(), error.getMessage()));
    }

    public record PostReq(@NotNull LostFound.Kind kind, @NotBlank String title,
                          String category, String description, String location,
                          OffsetDateTime happenedAt, String contactHint,
                          @Size(max = 6) List<UUID> imageIds) {}

    @PostMapping(value = "/images", consumes = "multipart/form-data")
    public ApiResponse<LostFoundImageService.Uploaded> upload(@RequestParam("file") MultipartFile file) throws IOException {
        return ApiResponse.ok(imageService.upload(file, AuthUser.currentId()));
    }

    @GetMapping("/images/{id}")
    public ResponseEntity<FileSystemResource> image(@PathVariable UUID id) {
        return imageService.read(id, AuthUser.current());
    }

    @GetMapping
    public ApiResponse<List<LostFound>> listPublished() {
        return ApiResponse.ok(repo.findByStatusOrderByCreatedAtDesc(LostFound.Status.PUBLISHED));
    }

    @GetMapping("/mine")
    public ApiResponse<List<LostFound>> mine() {
        return ApiResponse.ok(repo.findByUserIdOrderByCreatedAtDesc(AuthUser.currentId()));
    }

    @PostMapping
    @Transactional
    public ApiResponse<LostFound> post(@Valid @RequestBody PostReq req) {
        if (SENSITIVE.matcher(req.description() == null ? "" : req.description()).find()
                || SENSITIVE.matcher(req.title()).find()) {
            throw BizException.badRequest("内容包含疑似证件号/手机号等敏感信息，请删除后再发布");
        }
        var attachments = imageService.validateAttachments(req.imageIds(), AuthUser.currentId());
        LostFound lf = new LostFound();
        lf.setUserId(AuthUser.currentId());
        lf.setKind(req.kind());
        lf.setTitle(req.title());
        lf.setCategory(req.category());
        lf.setDescription(req.description());
        lf.setLocation(req.location());
        lf.setHappenedAt(req.happenedAt());
        lf.setContactHint(req.contactHint());
        lf.setStatus(LostFound.Status.PENDING_REVIEW); // 发布需审核
        repo.saveAndFlush(lf);
        lf.setImages(imageService.attach(attachments, lf.getId()));
        return ApiResponse.ok(repo.save(lf));
    }

    @PostMapping("/{id}/close")
    public ApiResponse<LostFound> close(@PathVariable Long id) {
        LostFound lf = repo.findById(id).orElseThrow(() -> BizException.notFound("信息"));
        if (!lf.getUserId().equals(AuthUser.currentId())) throw BizException.forbidden("只能关闭自己发布的信息");
        lf.setStatus(LostFound.Status.CLOSED);
        lf.setUpdatedAt(OffsetDateTime.now());
        return ApiResponse.ok(repo.save(lf));
    }

    // ===== 管理端 =====

    /** 管理端：全部内容（含待审核），支持按状态筛选 */
    @GetMapping("/admin/all")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<List<LostFound>> adminList(@RequestParam(required = false) String status) {
        if (status == null || status.isBlank()) {
            return ApiResponse.ok(repo.findAllByOrderByCreatedAtDesc());
        }
        LostFound.Status parsed;
        try {
            parsed = LostFound.Status.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw BizException.badRequest("状态值不合法：" + status + "，可选值 " + java.util.Arrays.toString(LostFound.Status.values()));
        }
        return ApiResponse.ok(repo.findByStatusOrderByCreatedAtDesc(parsed));
    }

    @PostMapping("/admin/lost-found/{id}/review")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<LostFound> review(@PathVariable Long id, @RequestParam boolean approve) {
        LostFound lf = repo.findById(id).orElseThrow(() -> BizException.notFound("信息"));
        lf.setStatus(approve ? LostFound.Status.PUBLISHED : LostFound.Status.REMOVED);
        lf.setUpdatedAt(OffsetDateTime.now());
        return ApiResponse.ok(repo.save(lf));
    }
}
