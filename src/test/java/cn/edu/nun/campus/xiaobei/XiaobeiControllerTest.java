package cn.edu.nun.campus.xiaobei;

import cn.edu.nun.campus.auth.JwtAuthFilter;
import cn.edu.nun.campus.auth.JwtService;
import cn.edu.nun.campus.config.SecurityConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(XiaobeiController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class, JwtService.class, XiaobeiErrorHandler.class})
@TestPropertySource(properties = {"app.jwt.secret=test-only-jwt-secret-01234567890123456789", "app.jwt.expire-minutes=120"})
class XiaobeiControllerTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @MockitoBean XiaobeiService service;

    @Test
    void publicCampusWorksWithoutAccount() throws Exception {
        when(service.call(any(), anyMap(), isNull())).thenReturn(new ObjectMapper().readTree("[]"));
        mvc.perform(get("/api/v1/campus/campus.list"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void allAcademicEndpointsRequireLocalLogin() throws Exception {
        for (var endpoint : XiaobeiEndpoints.all().values()) {
            if (!endpoint.personal()) continue;
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(endpoint.method()), "/api/v1/campus/" + endpoint.key()))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void jwtControlsUserIdentity() throws Exception {
        when(service.call(any(), anyMap(), eq(7L))).thenReturn(new ObjectMapper().readTree("{\"courses\":[]}"));
        mvc.perform(get("/api/v1/campus/jwxt.schedule").param("ext_user_id", "campus-agent:99")
                        .header("Authorization", "Bearer " + jwt.issue(7L, "student", "STUDENT")))
                .andExpect(status().isOk());
        verify(service).call(eq(XiaobeiEndpoints.find("jwxt.schedule")), anyMap(), eq(7L));
    }

    @Test
    void forgedTokenDoesNotGrantAcademicAccess() throws Exception {
        mvc.perform(get("/api/v1/campus/jwxt.grades").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsPendingWritesAndWrongMethods() throws Exception {
        mvc.perform(post("/api/v1/campus/activity.signup")).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/campus/campus.list")).andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(service);
    }
}
