package cn.edu.nun.campus.qa;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.knowledge.KnowledgeItem;
import cn.edu.nun.campus.knowledge.KnowledgeSearchService;
import cn.edu.nun.campus.llm.LlmClient;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 校园知识问答：先检索再回答，回答必须附来源；无依据时明确拒答；模型不可用时降级返回原文 */
@Slf4j
@RestController
@RequestMapping("/api/v1/qa")
public class QaController {

    private static final String SYSTEM_PROMPT = """
            你是北方民族大学校园服务助手。规则：
            1. 只能依据给定的【参考资料】回答，不得编造政策、时间、地点、电话；
            2. 参考资料中没有依据时，明确说"目前没有找到可核验的官方依据"，并建议用户咨询相关部门；
            3. 回答末尾用 [1][2] 标注引用的资料编号；
            4. 回答简洁，先给结论，再给下一步操作入口。
            """;

    private final KnowledgeSearchService searchService;
    private final LlmClient llm;

    public QaController(KnowledgeSearchService searchService, LlmClient llm) {
        this.searchService = searchService;
        this.llm = llm;
    }

    public record AskReq(@NotBlank String question) {}
    public record Source(Long id, String title, String sourceName, String sourceUrl,
                         boolean official, String publishedAt, boolean expired) {}
    public record AskRes(String answer, List<Source> sources, boolean grounded) {}

    @PostMapping("/ask")
    public ApiResponse<AskRes> ask(@Valid @RequestBody AskReq req) {
        List<KnowledgeItem> hits = searchService.search(req.question().trim(), null, 5);

        List<Source> sources = hits.stream().map(k -> new Source(
                k.getId(), k.getTitle(), k.getSourceName(), k.getSourceUrl(),
                k.isOfficial(),
                k.getPublishedAt() == null ? null : k.getPublishedAt().toString(),
                k.isExpired())).toList();

        if (hits.isEmpty()) {
            return ApiResponse.ok(new AskRes(
                    "目前没有找到可核验的官方依据。建议通过人工服务目录联系相关部门，或提交反馈帮助我们补充该内容。",
                    sources, false));
        }

        StringBuilder ref = new StringBuilder();
        for (int i = 0; i < hits.size(); i++) {
            KnowledgeItem k = hits.get(i);
            ref.append("[").append(i + 1).append("] ").append(k.getTitle())
               .append("（来源: ").append(k.getSourceName() == null ? "未知" : k.getSourceName());
            if (k.isExpired()) ref.append("，注意：该内容可能已过期");
            ref.append("）\n").append(k.getContent(), 0, Math.min(k.getContent().length(), 1500))
               .append("\n\n");
        }

        try {
            var result = llm.chat(List.of(
                    LlmClient.Message.system(SYSTEM_PROMPT),
                    LlmClient.Message.user("【参考资料】\n" + ref + "\n【用户问题】\n" + req.question())),
                    "qa");
            return ApiResponse.ok(new AskRes(result.content(), sources, true));
        } catch (Exception e) {
            // 降级策略（方案 10.2）：模型不可用时，仍返回检索到的官方内容与来源
            log.warn("LLM 调用失败，降级返回检索结果: {}", e.getMessage());
            StringBuilder fallback = new StringBuilder("AI 摘要暂时不可用，已为你找到以下官方内容，请核对来源原文：\n\n");
            for (int i = 0; i < hits.size(); i++) {
                KnowledgeItem k = hits.get(i);
                fallback.append("【").append(i + 1).append("】").append(k.getTitle());
                if (k.getSourceName() != null) fallback.append("（来源：").append(k.getSourceName()).append("）");
                if (k.isExpired()) fallback.append(" ⚠可能存在过期");
                fallback.append("\n").append(abbreviate(k.getContent(), 200)).append("\n\n");
            }
            return ApiResponse.ok(new AskRes(fallback.toString().trim(), sources, true));
        }
    }

    private String abbreviate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
