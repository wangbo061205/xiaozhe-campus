package cn.edu.nun.campus.config;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.assistant.AssistantSettingsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 公共配置（PROJECT §13：AI 标识、模型名、功能开关）。
 * 备案号等由人工填写后放这里（当前为演示占位，不冒充真实备案信息）。
 */
@RestController
@RequestMapping("/api/v1/config")
public class PublicConfigController {

    private final AssistantSettingsService assistantSettings;

    public PublicConfigController(AssistantSettingsService assistantSettings) {
        this.assistantSettings = assistantSettings;
    }

    @Value("${app.llm.deepseek.model:deepseek-chat}")
    private String modelName;

    @GetMapping("/public")
    public ApiResponse<Map<String, Object>> publicConfig() {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("aiLabel", "内容由 AI 生成");
        cfg.put("modelName", modelName);
        cfg.put("aiDisclaimer", "AI 回答仅供参考，校园政策与办事信息请以官方来源为准。");
        cfg.put("assistant", assistantSettings.publicSettings());
        cfg.put("features", List.of("search", "chat", "favorite", "course", "procedure", "ticket"));
        return ApiResponse.ok(cfg);
    }
}
