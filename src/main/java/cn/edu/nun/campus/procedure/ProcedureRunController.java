package cn.edu.nun.campus.procedure;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import cn.edu.nun.campus.knowledge.KnowledgeItem;
import cn.edu.nun.campus.knowledge.KnowledgeRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/** 办事办理进度：开始办理 → 材料勾选 → 标记完成/放弃 */
@RestController
@RequestMapping("/api/v1/procedure-runs")
public class ProcedureRunController {

    private static final ObjectMapper JSON = new ObjectMapper();

    public record StartReq(Long knowledgeId) {}
    public record UpdateReq(String materialChecks, String status) {}

    public record RunRes(Long id, Long knowledgeId, String title, String status, String content,
                         List<String> materials, String materialChecks, String startedAt, String completedAt) {}

    private final ProcedureRunRepository repo;
    private final KnowledgeRepository knowledge;

    public ProcedureRunController(ProcedureRunRepository repo, KnowledgeRepository knowledge) {
        this.repo = repo;
        this.knowledge = knowledge;
    }

    /** 开始办理（同一条目已有进行中的进度则直接返回，避免重复创建） */
    @PostMapping
    public ApiResponse<RunRes> start(@RequestBody StartReq req) {
        if (req.knowledgeId() == null) throw BizException.badRequest("缺少 knowledgeId");
        KnowledgeItem k = knowledge.findById(req.knowledgeId())
                .filter(x -> x.getStatus() == KnowledgeItem.Status.PUBLISHED)
                .orElseThrow(() -> BizException.notFound("事项"));
        Long uid = AuthUser.currentId();

        Optional<ProcedureRun> existing = repo.findByUserIdAndKnowledgeIdAndStatusIn(
                uid, req.knowledgeId(), List.of(ProcedureRun.Status.in_progress));
        if (existing.isPresent()) {
            return ApiResponse.ok(toRes(existing.get(), k));
        }
        ProcedureRun run = new ProcedureRun();
        run.setUserId(uid);
        run.setKnowledgeId(req.knowledgeId());
        repo.save(run);
        return ApiResponse.ok(toRes(run, k));
    }

    @GetMapping("/mine")
    public ApiResponse<List<RunRes>> mine() {
        List<RunRes> runs = repo.findByUserIdOrderByStartedAtDesc(AuthUser.currentId()).stream()
                .map(r -> {
                    KnowledgeItem k = knowledge.findById(r.getKnowledgeId()).orElse(null);
                    if (k == null) return null;
                    return toRes(r, k);
                })
                .filter(java.util.Objects::nonNull)
                .toList();
        return ApiResponse.ok(runs);
    }

    @GetMapping("/{id}")
    public ApiResponse<RunRes> detail(@PathVariable Long id) {
        ProcedureRun run = ownRun(id);
        KnowledgeItem k = knowledge.findById(run.getKnowledgeId())
                .orElseThrow(() -> BizException.notFound("事项"));
        return ApiResponse.ok(toRes(run, k));
    }

    /** 更新材料勾选 / 状态（done / abandoned / in_progress） */
    @PutMapping("/{id}")
    public ApiResponse<RunRes> update(@PathVariable Long id, @RequestBody UpdateReq req) {
        ProcedureRun run = ownRun(id);
        if (req.materialChecks() != null) run.setMaterialChecks(req.materialChecks());
        if (req.status() != null && !req.status().isBlank()) {
            ProcedureRun.Status st;
            try {
                st = ProcedureRun.Status.valueOf(req.status().trim().toLowerCase());
            } catch (IllegalArgumentException e) {
                throw BizException.badRequest("办理状态不合法：" + req.status()
                        + "，可选值 " + java.util.Arrays.toString(ProcedureRun.Status.values()));
            }
            run.setStatus(st);
            run.setCompletedAt(st == ProcedureRun.Status.done ? OffsetDateTime.now() : null);
        }
        run.setUpdatedAt(OffsetDateTime.now());
        repo.save(run);
        KnowledgeItem k = knowledge.findById(run.getKnowledgeId())
                .orElseThrow(() -> BizException.notFound("事项"));
        return ApiResponse.ok(toRes(run, k));
    }

    private ProcedureRun ownRun(Long id) {
        ProcedureRun run = repo.findById(id).orElseThrow(() -> BizException.notFound("办理进度"));
        if (!run.getUserId().equals(AuthUser.currentId())) throw BizException.forbidden("只能访问自己的办理进度");
        return run;
    }

    private RunRes toRes(ProcedureRun run, KnowledgeItem k) {
        List<String> materials = List.of();
        if (k.getMaterials() != null && !k.getMaterials().isBlank()) {
            try {
                materials = JSON.readValue(k.getMaterials(),
                        JSON.getTypeFactory().constructCollectionType(List.class, String.class));
            } catch (Exception ignored) {
            }
        }
        return new RunRes(run.getId(), k.getId(), k.getTitle(), run.getStatus().name(),
                k.getContent(), materials, run.getMaterialChecks(),
                run.getStartedAt().toString(),
                run.getCompletedAt() == null ? null : run.getCompletedAt().toString());
    }
}

@Repository
interface ProcedureRunRepository extends JpaRepository<ProcedureRun, Long> {
    List<ProcedureRun> findByUserIdOrderByStartedAtDesc(Long userId);
    Optional<ProcedureRun> findByUserIdAndKnowledgeIdAndStatusIn(
            Long userId, Long knowledgeId, List<ProcedureRun.Status> statuses);
}
