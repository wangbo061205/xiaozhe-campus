package cn.edu.nun.campus.xiaobei;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/campus")
public class XiaobeiController {
    private final XiaobeiService service;
    public XiaobeiController(XiaobeiService service) { this.service = service; }

    @GetMapping("/catalog")
    public ApiResponse<List<Map<String, Object>>> catalog() {
        return ApiResponse.ok(XiaobeiEndpoints.all().values().stream()
                .sorted(java.util.Comparator.comparing(XiaobeiEndpoints.Endpoint::key))
                .map(e -> Map.<String, Object>of("key", e.key(), "method", e.method(), "personal", e.personal()))
                .toList());
    }

    @RequestMapping(value = "/{key}", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.DELETE})
    public ResponseEntity<ApiResponse<JsonNode>> call(@PathVariable String key,
                                                     @RequestParam Map<String, String> query,
                                                     @RequestBody(required = false) Map<String, Object> body,
                                                     HttpServletRequest request) {
        var endpoint = XiaobeiEndpoints.find(key);
        if (endpoint == null) throw new XiaobeiException(404, "API_NOT_OPEN", "该服务尚未开放", null);
        if (!endpoint.method().equals(request.getMethod())) {
            throw new XiaobeiException(405, "METHOD_NOT_ALLOWED", "请求方式不正确", null);
        }
        if (endpoint.personal() && AuthUser.currentId() == null) {
            throw new XiaobeiException(401, "LOGIN_REQUIRED", "请先登录校园助手", null);
        }
        Map<String, Object> input = new LinkedHashMap<>(query);
        if (body != null) input.putAll(body);
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(ApiResponse.ok(service.call(endpoint, input, AuthUser.currentId())));
    }
}
