package cn.edu.nun.campus.xiaobei;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@Service
public class XiaobeiService {
    private final RestClient client;
    private final ObjectMapper mapper;
    private final String clientId;
    private final String clientSecret;
    private static final Set<String> SAFE_SETTINGS = Set.of("miniprogramName", "shareTitle", "information",
            "schoolInformation", "guanwei", "linkedMiniprograms", "mapLongitude", "mapLatitude", "mapScale",
            "webLinks", "mediaAssets", "campusCalendar", "scheduleReminder", "realtimeStats", "tencentChannelPublish");

    @Autowired
    public XiaobeiService(ObjectMapper mapper,
                          @Value("${app.xiaobei.base-url}") String baseUrl,
                          @Value("${app.xiaobei.client-id:}") String clientId,
                          @Value("${app.xiaobei.client-secret:}") String clientSecret) {
        this(makeClient(baseUrl), mapper, clientId, clientSecret);
    }

    XiaobeiService(RestClient client, ObjectMapper mapper, String clientId, String clientSecret) {
        this.client = client;
        this.mapper = mapper;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    private static RestClient makeClient(String baseUrl) {
        URI uri = URI.create(baseUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("XIAOBEI_BASE must be an HTTPS origin");
        }
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(50));
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    public JsonNode call(XiaobeiEndpoints.Endpoint endpoint, Map<String, Object> input, Long userId) {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new XiaobeiException(503, "SERVICE_NOT_CONFIGURED", "校园数据服务暂未配置", null);
        }
        if (endpoint.personal() && userId == null) {
            throw new XiaobeiException(401, "LOGIN_REQUIRED", "请先登录校园助手", null);
        }
        String path = endpoint.path();
        if (path.contains("{id}")) {
            String id = String.valueOf(input.getOrDefault("id", ""));
            if (!id.matches("[A-Za-z0-9_-]{1,128}")) {
                throw new XiaobeiException(400, "INVALID_PARAMETERS", "缺少有效的内容编号", null);
            }
            path = path.replace("{id}", id);
        }
        Map<String, Object> parameters = new LinkedHashMap<>();
        for (String name : endpoint.parameters()) {
            Object value = input.get(name);
            if (value == null || value.toString().isBlank()) continue;
            if (!(value instanceof String || value instanceof Number || value instanceof Boolean)
                    || value.toString().length() > 2048) {
                throw new XiaobeiException(400, "INVALID_PARAMETERS", "请求参数格式不正确", null);
            }
            parameters.put(name, value);
        }
        // The upstream identity always comes from the authenticated local account.
        if (endpoint.personal()) parameters.put("ext_user_id", "campus-agent:" + userId);
        if ("activity.detail".equals(endpoint.key())) parameters.put("trackView", "0");
        var request = client.method(HttpMethod.valueOf(endpoint.method()));
        if ("GET".equals(endpoint.method()) || "DELETE".equals(endpoint.method())) {
            String requestPath = path;
            request.uri(builder -> {
                builder.path(requestPath);
                parameters.forEach(builder::queryParam);
                return builder.build();
            });
        } else {
            request.uri(path).contentType(MediaType.APPLICATION_JSON).body(parameters);
        }
        request.header("X-Client-Id", clientId).header("X-Client-Secret", clientSecret);
        try {
            JsonNode data = request.exchange((req, response) -> {
                byte[] bytes = response.getBody().readNBytes(8 * 1024 * 1024 + 1);
                if (bytes.length > 8 * 1024 * 1024) {
                    throw new XiaobeiException(502, "UPSTREAM_ERROR", "校园服务返回内容过大", null);
                }
                JsonNode body;
                try { body = mapper.readTree(bytes); }
                catch (Exception e) { throw new XiaobeiException(502, "UPSTREAM_ERROR", "校园服务暂时不可用", null); }
                if (body == null) throw new XiaobeiException(502, "UPSTREAM_ERROR", "校园服务返回为空", null);
                String code = body.path("code").asText();
                if (!response.getStatusCode().is2xxSuccessful() || body.path("success").isBoolean() && !body.path("success").asBoolean()
                        || !("200".equals(code) || "OK".equals(code))) {
                    int status = response.getStatusCode().isError() ? response.getStatusCode().value() : 502;
                    if (body.path("code").isInt() && body.path("code").asInt() >= 400 && body.path("code").asInt() <= 599) {
                        status = body.path("code").asInt();
                    }
                    String message = body.path("message").asText(body.path("msg").asText("校园服务请求失败"));
                    throw new XiaobeiException(status, code.isBlank() ? "UPSTREAM_ERROR" : code,
                            message, body.path("requestId").asText(null));
                }
                return body.path("data");
            });
            if ("campus.settings".equals(endpoint.key()) && data != null && data.isObject()) {
                var safe = mapper.createObjectNode();
                SAFE_SETTINGS.forEach(key -> { if (data.has(key)) safe.set(key, data.get(key)); });
                return safe;
            }
            return data;
        } catch (ResourceAccessException e) {
            throw new XiaobeiException(504, "UPSTREAM_TIMEOUT", "校园服务连接超时，请稍后重试", null);
        }
    }
}
