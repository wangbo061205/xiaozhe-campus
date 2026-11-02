package cn.edu.nun.campus.agent.tools;

import cn.edu.nun.campus.agent.AgentTask;
import cn.edu.nun.campus.agent.Tool;
import cn.edu.nun.campus.todo.UserTodo;
import cn.edu.nun.campus.todo.UserTodoRepository;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Map;

/** 中风险：为当前用户创建待办（需用户授权，支持撤销） */
@Component
public class CreateTodoTool implements Tool {

    private final UserTodoRepository repo;

    public CreateTodoTool(UserTodoRepository repo) {
        this.repo = repo;
    }

    @Override public String name() { return "create_todo"; }
    @Override public AgentTask.RiskLevel riskLevel() { return AgentTask.RiskLevel.MEDIUM; }
    @Override public String description() { return "为当前用户创建个人待办（标题、备注、截止时间）"; }

    @Override
    public Object execute(Long userId, Map<String, Object> params) {
        String title = String.valueOf(params.getOrDefault("title", "")).trim();
        if (title.isEmpty()) throw new IllegalArgumentException("缺少参数 title");
        UserTodo t = new UserTodo();
        t.setUserId(userId);
        t.setTitle(title);
        t.setNote((String) params.get("note"));
        if (params.get("dueAt") != null) {
            t.setDueAt(OffsetDateTime.parse(String.valueOf(params.get("dueAt"))));
        }
        return repo.save(t);
    }
}
