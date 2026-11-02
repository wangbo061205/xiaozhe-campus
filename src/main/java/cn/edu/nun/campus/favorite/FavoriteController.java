package cn.edu.nun.campus.favorite;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import cn.edu.nun.campus.knowledge.KnowledgeItem;
import cn.edu.nun.campus.knowledge.KnowledgeRepository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

/** 个人收藏：收藏通知/指南等知识条目（P1） */
@RestController
@RequestMapping("/api/v1/favorites")
public class FavoriteController {

    public record FavReq(Long knowledgeId) {}
    public record FavItem(Long id, Long knowledgeId, String title, String type, String typeName,
                          String summary, String sourceName, boolean official) {}
    public record CheckRes(boolean favorited) {}

    private final FavoriteRepository repo;
    private final KnowledgeRepository knowledge;

    public FavoriteController(FavoriteRepository repo, KnowledgeRepository knowledge) {
        this.repo = repo;
        this.knowledge = knowledge;
    }

    @GetMapping
    public ApiResponse<List<FavItem>> mine() {
        Long uid = AuthUser.currentId();
        List<FavItem> items = repo.findByUserIdOrderByCreatedAtDesc(uid).stream()
                .map(f -> {
                    KnowledgeItem k = knowledge.findById(f.getKnowledgeId()).orElse(null);
                    if (k == null) return null;
                    return new FavItem(f.getId(), k.getId(), k.getTitle(), k.getType().name(),
                            typeName(k.getType()), k.getSummary(), k.getSourceName(), k.isOfficial());
                })
                .filter(java.util.Objects::nonNull)
                .toList();
        return ApiResponse.ok(items);
    }

    @GetMapping("/check")
    public ApiResponse<CheckRes> check(@RequestParam Long knowledgeId) {
        return ApiResponse.ok(new CheckRes(
                repo.findByUserIdAndKnowledgeId(AuthUser.currentId(), knowledgeId).isPresent()));
    }

    @PostMapping
    public ApiResponse<CheckRes> add(@RequestBody FavReq req) {
        if (req.knowledgeId() == null) throw BizException.badRequest("缺少 knowledgeId");
        knowledge.findById(req.knowledgeId())
                .filter(k -> k.getStatus() == KnowledgeItem.Status.PUBLISHED)
                .orElseThrow(() -> BizException.notFound("内容"));
        Long uid = AuthUser.currentId();
        Optional<Favorite> existing = repo.findByUserIdAndKnowledgeId(uid, req.knowledgeId());
        if (existing.isEmpty()) {
            Favorite f = new Favorite();
            f.setUserId(uid);
            f.setKnowledgeId(req.knowledgeId());
            repo.save(f);
        }
        return ApiResponse.ok(new CheckRes(true));
    }

    @DeleteMapping("/{knowledgeId}")
    public ApiResponse<CheckRes> remove(@PathVariable Long knowledgeId) {
        repo.findByUserIdAndKnowledgeId(AuthUser.currentId(), knowledgeId)
                .ifPresent(repo::delete);
        return ApiResponse.ok(new CheckRes(false));
    }

    private String typeName(KnowledgeItem.Type t) {
        return switch (t) {
            case NOTICE -> "通知";
            case POLICY -> "政策";
            case GUIDE -> "办事指南";
            case DEPARTMENT -> "部门";
            case PLACE -> "地点";
            case SERVICE -> "服务";
            case FAQ -> "常见问题";
        };
    }
}

@Repository
interface FavoriteRepository extends JpaRepository<Favorite, Long> {
    List<Favorite> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<Favorite> findByUserIdAndKnowledgeId(Long userId, Long knowledgeId);
}
