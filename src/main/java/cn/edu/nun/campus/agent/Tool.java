package cn.edu.nun.campus.agent;

import java.util.Map;

/**
 * Agent 可调用工具的白名单接口。
 * 每个工具必须自行完成参数校验与资源级权限校验（见方案 5.2/5.3）。
 */
public interface Tool {

    String name();

    /** 工具风险等级：决定是否需要用户确认 */
    AgentTask.RiskLevel riskLevel();

    String description();

    /** 执行。userId 为当前登录用户，params 已做基础类型校验 */
    Object execute(Long userId, Map<String, Object> params);
}
