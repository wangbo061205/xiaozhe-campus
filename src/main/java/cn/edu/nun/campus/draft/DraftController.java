package cn.edu.nun.campus.draft;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import cn.edu.nun.campus.knowledge.KnowledgeItem;
import cn.edu.nun.campus.knowledge.KnowledgeRepository;
import cn.edu.nun.campus.llm.LlmClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 申请草稿生成（PROJECT §10.2 第 4 步）：
 * 根据办事指南 + 用户补充信息生成申请草稿；缺失信息用【】占位，绝不编造个人信息。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/drafts")
public class DraftController {

    private static final String SYSTEM_PROMPT = """
            你是校园文书助手，帮助学生起草申请类文书。规则：
            1. 依据用户给出的事项和指南信息，写一份正式、简短的中文申请（顶格称呼、正文、此致敬礼、申请人/日期占位）；
            2. 用户没有提供的信息一律用【】占位（如【姓名】【学号】【日期】），绝不编造个人信息或事实；
            3. 不承诺审批结果，不虚构政策依据；
            4. 正文 200 字以内，语气礼貌得体；
            5. 只输出申请书正文，不要额外解释。
            """;

    public record GenReq(Long knowledgeId, String context) {}
    public record GenRes(String draft) {}

    private final KnowledgeRepository knowledge;
    private final LlmClient llm;

    public DraftController(KnowledgeRepository knowledge, LlmClient llm) {
        this.knowledge = knowledge;
        this.llm = llm;
    }

    @PostMapping("/generate")
    public ApiResponse<GenRes> generate(@RequestBody GenReq req) {
        if (req.knowledgeId() == null) throw BizException.badRequest("缺少 knowledgeId");
        KnowledgeItem k = knowledge.findById(req.knowledgeId())
                .filter(x -> x.getStatus() == KnowledgeItem.Status.PUBLISHED)
                .orElseThrow(() -> BizException.notFound("事项"));

        String guide = k.getContent() == null ? "" : k.getContent();
        if (guide.length() > 1200) guide = guide.substring(0, 1200);
        String ctx = req.context() == null ? "" : req.context().trim();
        if (ctx.length() > 300) ctx = ctx.substring(0, 300);

        String userMsg = "【办理事项】" + k.getTitle()
                + "\n【指南要点】\n" + guide
                + "\n【我的补充信息】\n" + (ctx.isEmpty() ? "（未提供，请用占位符）" : ctx);

        try {
            var result = llm.chat(List.of(
                    LlmClient.Message.system(SYSTEM_PROMPT),
                    LlmClient.Message.user(userMsg)), "draft");
            return ApiResponse.ok(new GenRes(result.content()));
        } catch (Exception e) {
            log.warn("草稿生成失败: {}", e.getMessage());
            throw new BizException(503, "草稿生成服务暂时不可用，请稍后再试");
        }
    }
}
