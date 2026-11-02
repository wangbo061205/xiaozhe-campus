package cn.edu.nun.campus.knowledge;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/v1")
public class KnowledgeController {

    private final KnowledgeRepository repo;
    private final KnowledgeSearchService searchService;

    public KnowledgeController(KnowledgeRepository repo, KnowledgeSearchService searchService) {
        this.repo = repo;
        this.searchService = searchService;
    }

    // ===== 公开检索 =====

    public record SearchHit(Long id, String type, String title, String summary,
                            String sourceName, String sourceUrl, boolean official,
                            String department, String publishedAt, boolean expired) {}

    @GetMapping("/search")
    public ApiResponse<List<SearchHit>> search(@RequestParam String q,
                                               @RequestParam(required = false) String type,
                                               @RequestParam(required = false) String excludeType,
                                               @RequestParam(defaultValue = "20") int limit) {
        if (q.isBlank()) throw BizException.badRequest("搜索关键词不能为空");
        if (type != null && type.isBlank()) type = null;  // 空串视为不筛选
        if (excludeType != null && excludeType.isBlank()) excludeType = null;
        if (excludeType != null) {
            try {
                excludeType = KnowledgeItem.Type.valueOf(excludeType.trim().toUpperCase(Locale.ROOT)).name();
            } catch (IllegalArgumentException error) {
                throw BizException.badRequest("未知排除类型: " + excludeType);
            }
        }
        limit = Math.min(Math.max(limit, 1), 50);
        List<SearchHit> hits = searchService.search(q.trim(), type, excludeType, limit).stream().map(k -> new SearchHit(
                k.getId(), k.getType().name(), k.getTitle(), k.getSummary(),
                k.getSourceName(), k.getSourceUrl(), k.isOfficial(),
                k.getDepartment(),
                k.getPublishedAt() == null ? null : k.getPublishedAt().toString(),
                k.isExpired())).toList();
        return ApiResponse.ok(hits);
    }

    /** 按类型列出最新已发布内容（首页最新通知 / 办事指南目录等） */
    @GetMapping("/knowledge/list")
    public ApiResponse<List<SearchHit>> list(@RequestParam(required = false) String type,
                                             @RequestParam(defaultValue = "20") int limit) {
        limit = Math.min(Math.max(limit, 1), 50);
        var pageable = org.springframework.data.domain.PageRequest.of(0, limit);
        List<KnowledgeItem> items;
        if (type == null || type.isBlank()) {
            items = repo.latestPublished(null, pageable);
        } else {
            KnowledgeItem.Type t;
            try {
                t = KnowledgeItem.Type.valueOf(type);
            } catch (IllegalArgumentException e) {
                throw BizException.badRequest("未知类型: " + type);
            }
            items = repo.latestPublished(t, pageable);
        }
        List<SearchHit> hits = items.stream().map(k -> new SearchHit(
                k.getId(), k.getType().name(), k.getTitle(), k.getSummary(),
                k.getSourceName(), k.getSourceUrl(), k.isOfficial(),
                k.getDepartment(),
                k.getPublishedAt() == null ? null : k.getPublishedAt().toString(),
                k.isExpired())).toList();
        return ApiResponse.ok(hits);
    }

    @GetMapping("/knowledge/{id}")
    public ApiResponse<KnowledgeItem> detail(@PathVariable Long id) {
        KnowledgeItem k = repo.findById(id).orElseThrow(() -> BizException.notFound("内容"));
        if (k.getStatus() != KnowledgeItem.Status.PUBLISHED) throw BizException.notFound("内容");
        return ApiResponse.ok(k);
    }

    // ===== 管理后台 =====

    public record UpsertReq(@NotNull KnowledgeItem.Type type,
                            @NotBlank String title,
                            @NotBlank String content,
                            String summary, String sourceName, String sourceUrl,
                            Boolean official, String department, String materials) {}

    /** 管理端：全状态列表（含待审核/已过期） */
    @GetMapping("/admin/knowledge")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<List<KnowledgeItem>> adminList(@RequestParam(required = false) String status,
                                                      @RequestParam(defaultValue = "50") int limit) {
        limit = Math.min(Math.max(limit, 1), 200);
        var pageable = org.springframework.data.domain.PageRequest.of(0, limit);
        List<KnowledgeItem> items;
        if (status == null || status.isBlank()) {
            items = repo.findAll(pageable).getContent();
        } else {
            KnowledgeItem.Status st;
            try {
                st = KnowledgeItem.Status.valueOf(status.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw BizException.badRequest("状态值不合法：" + status
                        + "，可选值 " + java.util.Arrays.toString(KnowledgeItem.Status.values()));
            }
            items = repo.findByStatusOrderByIdDesc(st, pageable);
        }
        return ApiResponse.ok(items);
    }

    @PostMapping("/admin/knowledge")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<KnowledgeItem> create(@Valid @RequestBody UpsertReq req) {
        KnowledgeItem k = new KnowledgeItem();
        apply(k, req);
        k.setCreatedBy(AuthUser.currentId());
        k.setStatus(KnowledgeItem.Status.PENDING_REVIEW);
        return ApiResponse.ok(repo.save(k));
    }

    @PutMapping("/admin/knowledge/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<KnowledgeItem> update(@PathVariable Long id, @Valid @RequestBody UpsertReq req) {
        KnowledgeItem k = repo.findById(id).orElseThrow(() -> BizException.notFound("内容"));
        apply(k, req);
        k.setVersion(k.getVersion() + 1);
        return ApiResponse.ok(repo.save(k));
    }

    @PostMapping("/admin/knowledge/{id}/publish")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<KnowledgeItem> publish(@PathVariable Long id) {
        KnowledgeItem k = repo.findById(id).orElseThrow(() -> BizException.notFound("内容"));
        k.setStatus(KnowledgeItem.Status.PUBLISHED);
        k.setReviewedBy(AuthUser.currentId());
        return ApiResponse.ok(repo.save(k));
    }

    @PostMapping("/admin/knowledge/{id}/expire")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<KnowledgeItem> expire(@PathVariable Long id) {
        KnowledgeItem k = repo.findById(id).orElseThrow(() -> BizException.notFound("内容"));
        k.setStatus(KnowledgeItem.Status.EXPIRED);
        return ApiResponse.ok(repo.save(k));
    }

    private void apply(KnowledgeItem k, UpsertReq req) {
        k.setType(req.type());
        k.setTitle(req.title());
        k.setContent(req.content());
        k.setSummary(req.summary());
        k.setSourceName(req.sourceName());
        k.setSourceUrl(req.sourceUrl());
        if (req.official() != null) k.setOfficial(req.official());
        k.setDepartment(req.department());
        if (req.materials() != null) k.setMaterials(req.materials());
    }
}
