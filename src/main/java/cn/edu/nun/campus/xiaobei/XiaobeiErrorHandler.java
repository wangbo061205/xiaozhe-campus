package cn.edu.nun.campus.xiaobei;

import cn.edu.nun.campus.course.CourseImportController;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {XiaobeiController.class, CourseImportController.class})
public class XiaobeiErrorHandler {
    @ExceptionHandler(XiaobeiException.class)
    public ResponseEntity<Map<String, Object>> handle(XiaobeiException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", e.status());
        body.put("errorCode", e.code());
        body.put("message", e.getMessage());
        body.put("requestId", e.requestId());
        body.put("data", null);
        return ResponseEntity.status(e.status()).header("Cache-Control", "no-store").body(body);
    }
}
