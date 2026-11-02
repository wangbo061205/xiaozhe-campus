package cn.edu.nun.campus.llm;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** 记录每次模型调用的 token 与估算成本；超出日预算时告警 */
@Slf4j
@Service
public class LlmUsageRecorder {

    /** DeepSeek 参考价（元/百万 token，输入/输出），可按实际调价 */
    private static final BigDecimal PRICE_INPUT_PER_M = new BigDecimal("2");
    private static final BigDecimal PRICE_OUTPUT_PER_M = new BigDecimal("3");

    private final LlmUsageRepository repo;
    private final BigDecimal dailyBudget;

    public LlmUsageRecorder(LlmUsageRepository repo,
                            @Value("${app.llm.budget-daily-cny:50}") double dailyBudget) {
        this.repo = repo;
        this.dailyBudget = BigDecimal.valueOf(dailyBudget);
    }

    public void record(String model, LlmClient.Result r, int latencyMs, boolean success, String purpose) {
        try {
            LlmUsage u = new LlmUsage();
            u.setProvider("deepseek");
            u.setModel(model);
            u.setUserId(AuthUser.currentId());
            u.setSuccess(success);
            u.setPurpose(purpose);
            u.setLatencyMs(latencyMs);
            if (r != null) {
                u.setPromptTokens(r.promptTokens());
                u.setOutputTokens(r.outputTokens());
                u.setCostCny(estimate(r.promptTokens(), r.outputTokens()));
            }
            repo.save(u);

            BigDecimal today = repo.costSince(OffsetDateTime.now().toLocalDate().atStartOfDay()
                    .atOffset(OffsetDateTime.now().getOffset()));
            if (today.compareTo(dailyBudget) > 0) {
                log.warn("LLM 日预算已超出: 今日累计 {} 元 > 预算 {} 元", today, dailyBudget);
            }
        } catch (Exception e) {
            log.error("记录 LLM 用量失败", e);
        }
    }

    private BigDecimal estimate(int prompt, int output) {
        BigDecimal in = PRICE_INPUT_PER_M.multiply(BigDecimal.valueOf(prompt))
                .divide(BigDecimal.valueOf(1_000_000), 6, java.math.RoundingMode.HALF_UP);
        BigDecimal out = PRICE_OUTPUT_PER_M.multiply(BigDecimal.valueOf(output))
                .divide(BigDecimal.valueOf(1_000_000), 6, java.math.RoundingMode.HALF_UP);
        return in.add(out);
    }
}
