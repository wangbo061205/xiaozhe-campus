package cn.edu.nun.campus.agent;

import cn.edu.nun.campus.audit.AuditService;
import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Agent 任务入口。
 * 中/高风险工具调用必须先创建任务（READY_FOR_REVIEW），用户确认（confirm）后才执行。
 */
@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    private final AgentTaskRepository tasks;
    private final ToolRegistry registry;
    private final AuditService audit;

    public AgentController(AgentTaskRepository tasks, ToolRegistry registry, AuditService audit) {
        this.tasks = tasks;
        this.registry = registry;
        this.audit = audit;
    }

    public record CreateTaskReq(@NotBlank String goal, String toolName, Map<String, Object> params) {}
    public record ToolInfo(String name, String riskLevel, String description) {}

    @GetMapping("/tools")
    public ApiResponse<List<ToolInfo>> tools() {
        return ApiResponse.ok(registry.list().stream()
                .map(t -> new ToolInfo(t.name(), t.riskLevel().name(), t.description()))
                .toList());
    }

    @GetMapping("/tasks")
    public ApiResponse<List<AgentTask>> myTasks() {
        return ApiResponse.ok(tasks.findByUserIdOrderByUpdatedAtDesc(AuthUser.currentId()));
    }

    /** 提交任务：LOW 直接执行；MEDIUM/HIGH 进入待确认状态 */
    @PostMapping("/tasks")
    public ApiResponse<AgentTask> create(@Valid @RequestBody CreateTaskReq req) {
        Long userId = AuthUser.currentId();
        AgentTask t = new AgentTask();
        t.setUserId(userId);
        t.setGoal(req.goal());

        if (req.toolName() == null || req.toolName().isBlank()) {
            // 仅记录目标，等待后续对话补充（NEED_INPUT）
            t.setStatus(AgentTask.Status.NEED_INPUT);
            return ApiResponse.ok(tasks.save(t));
        }

        Tool tool = registry.require(req.toolName());
        t.setRiskLevel(tool.riskLevel());
        t.setContext(toJson(Map.of("tool", tool.name(), "params",
                req.params() == null ? Map.of() : req.params())));

        if (tool.riskLevel() == AgentTask.RiskLevel.LOW) {
            execute(t, tool, req.params());
        } else {
            // 待用户确认
            t.setStatus(AgentTask.Status.READY_FOR_REVIEW);
            t.setResult("操作待确认：" + tool.description());
            tasks.save(t);
        }
        return ApiResponse.ok(t);
    }

    /** 用户确认后执行（中/高风险） */
    @PostMapping("/tasks/{id}/confirm")
    public ApiResponse<AgentTask> confirm(@PathVariable Long id) {
        AgentTask t = ownedTask(id);
        if (t.getStatus() != AgentTask.Status.READY_FOR_REVIEW) {
            throw BizException.badRequest("当前状态不可确认: " + t.getStatus());
        }
        audit.record(t.getUserId(), "HIGH_RISK_CONFIRM",
                "{\"taskId\":" + id + ",\"risk\":\"" + t.getRiskLevel() + "\"}");

        // 从 context 还原工具与参数（MVP：仅支持已注册工具名）
        String ctx = t.getContext() == null ? "" : t.getContext();
        String toolName = extractToolName(ctx);
        Tool tool = registry.require(toolName);
        t.setStatus(AgentTask.Status.CONFIRMED);
        execute(t, tool, null);
        return ApiResponse.ok(t);
    }

    @PostMapping("/tasks/{id}/cancel")
    public ApiResponse<AgentTask> cancel(@PathVariable Long id) {
        AgentTask t = ownedTask(id);
        if (t.getStatus() == AgentTask.Status.COMPLETED) {
            throw BizException.badRequest("已完成任务不可取消");
        }
        t.setStatus(AgentTask.Status.CANCELLED);
        t.setUpdatedAt(OffsetDateTime.now());
        return ApiResponse.ok(tasks.save(t));
    }

    private AgentTask ownedTask(Long id) {
        AgentTask t = tasks.findById(id).orElseThrow(() -> BizException.notFound("任务"));
        if (!t.getUserId().equals(AuthUser.currentId())) {
            audit.record(AuthUser.currentId(), "PERMISSION_DENIED", "{\"taskId\":" + id + "}");
            throw BizException.forbidden("无权操作该任务");
        }
        return t;
    }

    private void execute(AgentTask t, Tool tool, Map<String, Object> params) {
        t.setStatus(AgentTask.Status.IN_PROGRESS);
        tasks.save(t);
        long start = System.currentTimeMillis();
        try {
            // 注意：确认场景下参数应从 context 反序列化恢复（MVP 简化：由客户端在 confirm 前补齐）
            Object result = tool.execute(t.getUserId(), params == null ? Map.of() : params);
            t.setStatus(AgentTask.Status.COMPLETED);
            t.setResult(String.valueOf(result));
        } catch (Exception e) {
            t.setStatus(AgentTask.Status.FAILED);
            t.setResult("执行失败: " + e.getMessage());
        } finally {
            t.setUpdatedAt(OffsetDateTime.now());
            tasks.save(t);
            audit.record(t.getUserId(), "TOOL_CALL",
                    "{\"tool\":\"" + tool.name() + "\",\"status\":\"" + t.getStatus()
                            + "\",\"ms\":" + (System.currentTimeMillis() - start) + "}");
        }
    }

    private String toJson(Map<String, Object> m) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(m);
        } catch (Exception e) {
            return "{}";
        }
    }

    private String extractToolName(String ctxJson) {
        try {
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(ctxJson);
            return node.path("tool").asText();
        } catch (Exception e) {
            throw BizException.badRequest("任务上下文损坏");
        }
    }
}
