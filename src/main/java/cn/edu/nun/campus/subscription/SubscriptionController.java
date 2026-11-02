package cn.edu.nun.campus.subscription;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import cn.edu.nun.campus.knowledge.KnowledgeItem;
import cn.edu.nun.campus.knowledge.KnowledgeRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 类别订阅：订阅通知/政策/指南等类别，查看订阅类别的最新内容（站内提醒版） */
@RestController
@RequestMapping("/api/v1/subscriptions")
public class SubscriptionController {

    private static final List<String> ALLOWED = List.of("NOTICE", "POLICY", "GUIDE", "FAQ");

    public record ToggleReq(String type) {}
    public record FeedItem(Long id, String title, String type, String typeName, String sourceName) {}

    private final SubscriptionRepository repo;
    private final KnowledgeRepository knowledge;

    public SubscriptionController(SubscriptionRepository repo, KnowledgeRepository knowledge) {
        this.repo = repo;
        this.knowledge = knowledge;
    }

    @GetMapping
    public ApiResponse<List<String>> mine() {
        return ApiResponse.ok(repo.findByUserIdOrderByCreatedAtAsc(AuthUser.currentId())
                .stream().map(UserSubscription::getType).toList());
    }

    @PostMapping("/toggle")
    public ApiResponse<List<String>> toggle(@RequestBody ToggleReq req) {
        String type = req.type() == null ? "" : req.type().toUpperCase();
        if (!ALLOWED.contains(type)) throw BizException.badRequest("不支持的订阅类别");
        Long uid = AuthUser.currentId();
        var existing = repo.findByUserIdAndType(uid, type);
        if (existing.isPresent()) {
            repo.delete(existing.get());
        } else {
            UserSubscription s = new UserSubscription();
            s.setUserId(uid);
            s.setType(type);
            repo.save(s);
        }
        return mine();
    }

    /** 订阅类别的最新内容（每类最多 4 条，按入库倒序合并） */
    @GetMapping("/feed")
    public ApiResponse<List<FeedItem>> feed() {
        List<String> types = repo.findByUserIdOrderByCreatedAtAsc(AuthUser.currentId())
                .stream().map(UserSubscription::getType).toList();
        Map<Long, FeedItem> merged = new LinkedHashMap<>();
        for (String t : types) {
            try {
                KnowledgeItem.Type kt = KnowledgeItem.Type.valueOf(t);
                var items = knowledge.findByStatusAndTypeOrderByIdDesc(
                        KnowledgeItem.Status.PUBLISHED, kt, PageRequest.of(0, 4));
                for (KnowledgeItem k : items) {
                    merged.putIfAbsent(k.getId(), new FeedItem(k.getId(), k.getTitle(),
                            k.getType().name(), typeName(k.getType()), k.getSourceName()));
                }
            } catch (IllegalArgumentException ignored) {
            }
        }
        List<FeedItem> list = new ArrayList<>(merged.values());
        list.sort((a, b) -> Long.compare(b.id(), a.id()));
        return ApiResponse.ok(list.stream().limit(12).toList());
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
interface SubscriptionRepository extends JpaRepository<UserSubscription, Long> {
    List<UserSubscription> findByUserIdOrderByCreatedAtAsc(Long userId);
    java.util.Optional<UserSubscription> findByUserIdAndType(Long userId, String type);
}
