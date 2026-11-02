package cn.edu.nun.campus.xiaobei;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class XiaobeiServiceTest {
    MockRestServiceServer server;
    XiaobeiService service;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl("https://campus.example");
        server = MockRestServiceServer.bindTo(builder).build();
        service = new XiaobeiService(builder.build(), new ObjectMapper(), "test-client", "test-secret");
    }

    @Test
    void campusSuccessUsesServerCredentialsAndEncodesSearch() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://campus.example/api/o/site/search?")))
                .andExpect(request -> {
                    String query = request.getURI().getRawQuery();
                    assertTrue(query.contains("campus_id=east"));
                    assertTrue(query.contains("content=%E5%9B%BE%E4%B9%A6%E9%A6%86"));
                    assertFalse(query.contains("client_secret"));
                    assertFalse(query.contains("evil.example"));
                })
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Client-Id", "test-client"))
                .andExpect(header("X-Client-Secret", "test-secret"))
                .andRespond(withSuccess("{\"code\":200,\"data\":[{\"name\":\"Library\"}]}", MediaType.APPLICATION_JSON));
        var result = service.call(XiaobeiEndpoints.find("site.search"),
                Map.of("campus_id", "east", "content", "图书馆", "client_secret", "injected", "url", "https://evil.example"), null);
        assertEquals("Library", result.get(0).path("name").asText());
        server.verify();
    }

    @Test
    void userIdentityCannotBeOverridden() {
        server.expect(requestTo("https://campus.example/api/jwxt/external/auth"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"studentNo\":\"123\",\"password\":\"user-password\",\"ext_user_id\":\"campus-agent:7\"}"))
                .andExpect(headerDoesNotExist("Authorization"))
                .andRespond(withSuccess("{\"code\":200,\"data\":{\"authenticated\":true}}", MediaType.APPLICATION_JSON));
        assertTrue(service.call(XiaobeiEndpoints.find("jwxt.auth"), Map.of("studentNo", "123", "password", "user-password",
                "ext_user_id", "campus-agent:99", "Authorization", "injected"), 7L).path("authenticated").asBoolean());
        server.verify();
    }

    @Test
    void anonymousPersonalCallsFailBeforeNetwork() {
        for (var endpoint : XiaobeiEndpoints.all().values()) {
            if (endpoint.personal()) {
                var error = assertThrows(XiaobeiException.class, () -> service.call(endpoint, Map.of(), null));
                assertEquals("LOGIN_REQUIRED", error.code());
            }
        }
        server.verify();
    }

    @Test
    void settingsDoNotExposeProviderKeys() {
        server.expect(requestTo("https://campus.example/api/o/settings"))
                .andRespond(withSuccess("{\"code\":200,\"data\":{\"miniprogramName\":\"Campus\",\"mapKey\":\"private-map-key\",\"weatherKey\":\"private-weather-key\",\"clientSecret\":\"private-secret\"}}", MediaType.APPLICATION_JSON));
        var result = service.call(XiaobeiEndpoints.find("campus.settings"), Map.of(), null);
        assertEquals("Campus", result.path("miniprogramName").asText());
        assertEquals(1, result.size());
    }

    @Test
    void preservesGatewayAndLegacyFailures() {
        server.expect(requestTo("https://campus.example/api/o/campus"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"success\":false,\"code\":\"CLIENT_DISABLED\",\"message\":\"pending\",\"requestId\":\"trace-1\"}"));
        var error = assertThrows(XiaobeiException.class, () -> service.call(XiaobeiEndpoints.find("campus.list"), Map.of(), null));
        assertEquals(403, error.status());
        assertEquals("CLIENT_DISABLED", error.code());
        assertEquals("trace-1", error.requestId());
        server.verify();
    }

    @Test
    void rejectsUnsafeDetailIdWithoutNetwork() {
        for (String id : new String[]{"../settings", "x?client_secret=stolen", "https://evil.example", ""}) {
            assertThrows(XiaobeiException.class, () -> service.call(XiaobeiEndpoints.find("site.detail"), Map.of("id", id), null));
        }
    }

    @Test
    void legacyBusinessFailureIsNotReportedAsSuccess() {
        server.expect(requestTo("https://campus.example/api/o/campus"))
                .andRespond(withSuccess("{\"code\":500,\"msg\":\"road unavailable\",\"data\":null}", MediaType.APPLICATION_JSON));
        var error = assertThrows(XiaobeiException.class, () -> service.call(XiaobeiEndpoints.find("campus.list"), Map.of(), null));
        assertEquals(500, error.status());
        assertEquals("road unavailable", error.getMessage());
    }

    @Test
    void academicStringFailurePreservesErrorCode() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://campus.example/api/jwxt/external/schedule?")))
                .andRespond(withSuccess("{\"code\":\"SHARE_REQUIRED\",\"message\":\"authorization required\",\"requestId\":\"trace-2\"}", MediaType.APPLICATION_JSON));
        var error = assertThrows(XiaobeiException.class, () -> service.call(XiaobeiEndpoints.find("jwxt.schedule"), Map.of(), 7L));
        assertEquals("SHARE_REQUIRED", error.code());
        assertEquals("trace-2", error.requestId());
    }

    @Test
    void seededOpenEndpointsOnly() {
        assertEquals(45, XiaobeiEndpoints.all().size());
        assertEquals(11, XiaobeiEndpoints.all().values().stream().filter(XiaobeiEndpoints.Endpoint::personal).count());
        for (String key : new String[]{"activity.signup", "lottery.draw", "comment-room.post", "channel.submit", "admin.apps"}) {
            assertNull(XiaobeiEndpoints.find(key));
        }
    }
}
