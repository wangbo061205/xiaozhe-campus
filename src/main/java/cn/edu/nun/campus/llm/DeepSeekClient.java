package cn.edu.nun.campus.llm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import javax.net.ssl.SSLParameters;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class DeepSeekClient implements LlmClient {

    private final HttpClient http;
    private final URI endpoint;
    private final String apiKey;
    private final ObjectMapper json = new ObjectMapper();
    private final String model;
    private final int maxRetries;
    private final Duration timeout;
    private final LlmUsageRecorder usageRecorder;

    public DeepSeekClient(@Value("${app.llm.deepseek.base-url}") String baseUrl,
                          @Value("${app.llm.deepseek.api-key}") String apiKey,
                          @Value("${app.llm.deepseek.model}") String model,
                          @Value("${app.llm.deepseek.timeout-seconds}") int timeoutSeconds,
                          @Value("${app.llm.deepseek.max-retries}") int maxRetries,
                          LlmUsageRecorder usageRecorder) {
        this.model = model;
        this.apiKey = apiKey;
        this.endpoint = URI.create(baseUrl.replaceAll("/+$", "") + "/chat/completions");
        this.maxRetries = maxRetries;
        this.timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
        this.usageRecorder = usageRecorder;
        // TLS 1.2 works with the current network path; keep normal certificate and hostname verification.
        var tls = new SSLParameters();
        tls.setProtocols(new String[]{"TLSv1.2"});
        this.http = HttpClient.newBuilder().sslParameters(tls).version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public Result chat(List<Message> messages, String purpose) {
        long start = System.currentTimeMillis();
        var body = Map.of(
                "model", model,
                "messages", messages.stream()
                        .map(m -> Map.of("role", m.role(), "content", m.content()))
                        .toList(),
                "stream", false);
        byte[] payload;
        try { payload = json.writeValueAsBytes(body); }
        catch (Exception e) { throw new LlmException("模型请求无法编码", e); }

        RuntimeException last = null;
        boolean courseImport = "course-import".equals(purpose);
        int retries = courseImport ? Math.min(1, maxRetries) : maxRetries;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                var request = HttpRequest.newBuilder(endpoint)
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json; charset=utf-8")
                        .timeout(courseImport ? Duration.ofSeconds(60) : timeout)
                        .POST(HttpRequest.BodyPublishers.ofByteArray(payload)).build();
                var response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
                int status = response.statusCode();
                if (status >= 400 && status < 500 && status != 429)
                    throw new Rejected("模型请求被拒绝: " + status);
                if (status < 200 || status >= 300) throw new LlmException("模型服务异常: " + status);
                if (response.body().length > 4 * 1024 * 1024) throw new Rejected("模型返回内容过大");
                Map<String, Object> resp = json.readValue(response.body(), new TypeReference<>() {});

                Result r = parse(resp);
                usageRecorder.record(model, r, (int) (System.currentTimeMillis() - start), true, purpose);
                return r;
            } catch (Rejected e) {
                usageRecorder.record(model, null, (int) (System.currentTimeMillis() - start), false, purpose);
                throw e;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                usageRecorder.record(model, null, (int) (System.currentTimeMillis() - start), false, purpose);
                throw new LlmException("模型请求已取消", e);
            } catch (Exception e) {
                last = new LlmException("模型调用失败: " + e.getMessage(), e);
            }
            log.warn("LLM 调用第 {} 次失败: {}", attempt + 1, last.getMessage());
        }
        usageRecorder.record(model, null, (int) (System.currentTimeMillis() - start), false, purpose);
        throw last;
    }

    private static final class Rejected extends LlmException {
        Rejected(String message) { super(message); }
    }

    @SuppressWarnings("unchecked")
    private Result parse(Map<String, Object> resp) {
        if (resp == null) throw new LlmException("模型返回为空");
        var choices = (List<Map<String, Object>>) resp.get("choices");
        if (choices == null || choices.isEmpty()) throw new LlmException("模型返回无 choices");
        var message = (Map<String, Object>) choices.get(0).get("message");
        String content = (String) message.get("content");
        int promptTokens = 0, outputTokens = 0;
        var usage = (Map<String, Object>) resp.get("usage");
        if (usage != null) {
            promptTokens = ((Number) usage.getOrDefault("prompt_tokens", 0)).intValue();
            outputTokens = ((Number) usage.getOrDefault("completion_tokens", 0)).intValue();
        }
        return new Result(content, promptTokens, outputTokens, model);
    }
}
