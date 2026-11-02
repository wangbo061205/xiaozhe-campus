package cn.edu.nun.campus.knowledge;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/v1/admin/knowledge")
@PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
public class KnowledgeLibraryController {
    private final KnowledgeRepository repository;

    public KnowledgeLibraryController(KnowledgeRepository repository) {
        this.repository = repository;
    }

    public record LibraryPage(List<KnowledgeItem> items, long total, int page, int size) {}

    @GetMapping("/page")
    public ApiResponse<LibraryPage> page(@RequestParam(required = false) String status,
                                        @RequestParam(required = false) String type,
                                        @RequestParam(defaultValue = "") String q,
                                        @RequestParam(required = false) String category,
                                        @RequestParam(required = false) String site,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "50") int size) {
        if (q.length() > 200 || page < 0 || page > 100000 || size < 1 || size > 200) {
            throw BizException.badRequest("搜索词最多200字，页码需非负，每页1至200条");
        }
        KnowledgeItem.Status selectedStatus = parse(KnowledgeItem.Status.class, status);
        KnowledgeItem.Type selectedType = parse(KnowledgeItem.Type.class, type);
        Specification<KnowledgeItem> specification = (root, query, cb) -> {
            List<Predicate> terms = new ArrayList<>();
            if (selectedStatus != null) terms.add(cb.equal(root.get("status"), selectedStatus));
            if (selectedType != null) terms.add(cb.equal(root.get("type"), selectedType));
            if (category != null && !category.isBlank()) terms.add(cb.equal(root.get("sourceCategory"), category));
            if (site != null && !site.isBlank()) terms.add(cb.equal(root.get("sourceSite"), site));
            if (!q.isBlank()) {
                String pattern = "%" + q.trim().toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                terms.add(cb.or(List.of("title", "content", "sourceName", "department", "sourceCategory")
                        .stream().map(field -> cb.like(cb.lower(root.get(field)), pattern, '\\'))
                        .toArray(Predicate[]::new)));
            }
            return cb.and(terms.toArray(Predicate[]::new));
        };
        Sort order = selectedType == KnowledgeItem.Type.NOTICE
                ? Sort.by(Sort.Order.desc("publishedAt").nullsLast(), Sort.Order.desc("createdAt"), Sort.Order.desc("id"))
                : Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        var result = repository.findAll(specification, PageRequest.of(page, size, order));
        return ApiResponse.ok(new LibraryPage(result.getContent(), result.getTotalElements(), page, size));
    }

    private static <T extends Enum<T>> T parse(Class<T> type, String value) {
        if (value == null || value.isBlank()) return null;
        try { return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException error) { throw BizException.badRequest("筛选类型或状态不正确"); }
    }
}
