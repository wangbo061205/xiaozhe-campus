package cn.edu.nun.campus.agent;

import cn.edu.nun.campus.common.BizException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 工具白名单注册表：未注册的工具一律拒绝调用 */
@Component
public class ToolRegistry {

    private final Map<String, Tool> tools;

    public ToolRegistry(List<Tool> all) {
        this.tools = all.stream().collect(Collectors.toMap(Tool::name, Function.identity()));
    }

    public Tool require(String name) {
        Tool t = tools.get(name);
        if (t == null) throw BizException.forbidden("工具未注册或未授权: " + name);
        return t;
    }

    public List<Tool> list() {
        return List.copyOf(tools.values());
    }
}
