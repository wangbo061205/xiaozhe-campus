package cn.edu.nun.campus.auth;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.GlobalExceptionHandler;
import cn.edu.nun.campus.config.SecurityConfig;
import cn.edu.nun.campus.todo.TodoController;
import cn.edu.nun.campus.todo.UserTodo;
import cn.edu.nun.campus.todo.UserTodoRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = GuestSessionTest.TestApplication.class, properties = {
        // Override default config discovery, including imports of local private properties.
        "spring.config.location=optional:classpath:/guest-session-test-only.properties",
        "spring.config.import=",
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration",
        "spring.datasource.url=jdbc:h2:mem:guestsessions;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.open-in-view=false",
        "app.jwt.secret=guest-session-test-only-signing-key-0123456789",
        "app.jwt.expire-minutes=120"
})
@AutoConfigureMockMvc
@Transactional
class GuestSessionTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @EntityScan(basePackageClasses = {UserEntity.class, UserTodo.class})
    @EnableJpaRepositories(basePackageClasses = {UserRepository.class, UserTodoRepository.class})
    @Import({AuthController.class, GuestSessionService.class, JwtService.class, JwtAuthFilter.class,
            SecurityConfig.class, TodoController.class, GlobalExceptionHandler.class, AdminProbe.class})
    static class TestApplication {}

    @RestController
    static class AdminProbe {
        @GetMapping("/api/v1/admin/session-probe")
        ApiResponse<String> admin() { return ApiResponse.ok("admin"); }

        @GetMapping({"/admin.css", "/admin.js"})
        String staticAsset() { return "test asset"; }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;

    private JsonNode guest() throws Exception {
        return data(mvc.perform(post("/api/v1/auth/guest").contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode data(String response) throws Exception { return json.readTree(response).get("data"); }
    private String credentials(JsonNode guest) throws Exception {
        return json.writeValueAsString(Map.of("guestId", guest.get("guestId").asText(),
                "guestSecret", guest.get("guestSecret").asText()));
    }
    private String authorization(JsonNode account) { return "Bearer " + account.get("token").asText(); }

    private UserEntity administrator(String username) {
        UserEntity admin = new UserEntity();
        admin.setUsername(username);
        admin.setPasswordHash(encoder.encode("test-admin-password"));
        admin.setDisplayName("管理员");
        admin.setRole(UserEntity.Role.ADMIN);
        return users.saveAndFlush(admin);
    }

    @Test
    void newSessionsCreateDistinctGuestAccountsWithHashedRandomProofs() throws Exception {
        JsonNode first = guest(), second = guest();
        assertNotEquals(first.get("userId"), second.get("userId"));
        assertNotEquals(first.get("guestId"), second.get("guestId"));
        assertNotEquals(first.get("guestSecret"), second.get("guestSecret"));
        for (JsonNode session : new JsonNode[]{first, second}) {
            assertEquals("校园访客", session.get("displayName").asText());
            assertEquals("GUEST", session.get("role").asText());
            assertTrue(session.get("guestId").asText().matches("guest_[0-9a-f-]{36}"));
            String proof = session.get("guestSecret").asText();
            assertTrue(proof.matches("[A-Za-z0-9_-]{43}"));
            UserEntity account = users.findById(session.get("userId").asLong()).orElseThrow();
            assertEquals(UserEntity.Role.GUEST, account.getRole());
            assertNotEquals(proof, account.getPasswordHash());
            assertTrue(account.getPasswordHash().startsWith("$2"));
            assertTrue(encoder.matches(proof, account.getPasswordHash()));
            assertEquals("GUEST", jwt.parse(session.get("token").asText()).get("role"));
        }
    }

    @Test
    void validProofRenewsTheSameIdentityAndIssuesANewToken() throws Exception {
        JsonNode first = guest();
        JsonNode renewed = data(mvc.perform(post("/api/v1/auth/guest").contentType("application/json")
                        .content(credentials(first)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString());
        assertEquals(first.get("userId"), renewed.get("userId"));
        assertEquals(first.get("guestId"), renewed.get("guestId"));
        assertEquals(first.get("guestSecret"), renewed.get("guestSecret"));
        assertNotEquals(first.get("token"), renewed.get("token"));
        assertEquals(1, users.count());
    }

    @Test
    void missingIncompleteOversizedAndMalformedBodiesAreRejected() throws Exception {
        JsonNode account = guest();
        for (String body : new String[]{
                "{\"guestId\":\"" + account.get("guestId").asText() + "\"}",
                "{\"guestSecret\":\"" + account.get("guestSecret").asText() + "\"}",
                "{\"guestId\":\"\",\"guestSecret\":\"\"}",
                json.writeValueAsString(Map.of("guestId", "x".repeat(65), "guestSecret", "x")),
                json.writeValueAsString(Map.of("guestId", "guest_x", "guestSecret", "x".repeat(129))),
                "{", "null", "[]"}) {
            mvc.perform(post("/api/v1/auth/guest").contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(400));
        }
        mvc.perform(post("/api/v1/auth/guest").contentType("application/json"))
                .andExpect(status().isBadRequest());
        assertEquals(1, users.count());
    }

    @Test
    void forgedWrongDisabledAndNonGuestIdentitiesHaveTheSameUnauthorizedResponse() throws Exception {
        JsonNode first = guest(), second = guest();
        UserEntity admin = administrator("test-admin");
        // Even a matching secret hash cannot turn an existing administrator into a guest session.
        UserEntity prefixedAdmin = administrator("guest_00000000-0000-0000-0000-000000000001");
        prefixedAdmin.setPasswordHash(encoder.encode(first.get("guestSecret").asText()));
        users.saveAndFlush(prefixedAdmin);
        UserEntity disabled = users.findById(second.get("userId").asLong()).orElseThrow();
        disabled.setEnabled(false);
        users.saveAndFlush(disabled);
        String commonResponse = null;
        for (Map<String, String> pair : List.of(
                Map.of("guestId", first.get("guestId").asText(), "guestSecret", second.get("guestSecret").asText()),
                Map.of("guestId", "guest_00000000-0000-0000-0000-000000000002", "guestSecret", first.get("guestSecret").asText()),
                Map.of("guestId", admin.getUsername(), "guestSecret", first.get("guestSecret").asText()),
                Map.of("guestId", admin.getId().toString(), "guestSecret", first.get("guestSecret").asText()),
                Map.of("guestId", prefixedAdmin.getUsername(), "guestSecret", first.get("guestSecret").asText()),
                Map.of("guestId", second.get("guestId").asText(), "guestSecret", second.get("guestSecret").asText()),
                Map.of("guestId", first.get("guestId").asText(), "guestSecret", "wrong-proof"))) {
            String response = mvc.perform(post("/api/v1/auth/guest").contentType("application/json")
                            .content(json.writeValueAsString(pair)))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(401))
                    .andReturn().getResponse().getContentAsString();
            if (commonResponse == null) commonResponse = response;
            else assertEquals(commonResponse, response);
        }
        assertEquals(4, users.count());
    }

    @Test
    void guestsCannotUsePasswordLoginOrReserveTheirNamespaceThroughRegistration() throws Exception {
        JsonNode account = guest();
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                        .content(json.writeValueAsString(Map.of("username", account.get("guestId").asText(),
                                "password", account.get("guestSecret").asText()))))
                .andExpect(jsonPath("$.code").value(400)).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                        .content("{\"username\":\"GUEST_reserved\",\"password\":\"test-password\",\"displayName\":\"Test\"}"))
                .andExpect(jsonPath("$.code").value(400));
        assertEquals(1, users.count());
    }

    @Test
    void callerSuppliedRoleAndUserIdCannotElevateAGuest() throws Exception {
        UserEntity admin = administrator("test-admin");
        JsonNode account = data(mvc.perform(post("/api/v1/auth/guest").contentType("application/json")
                        .content("{\"userId\":" + admin.getId() + ",\"role\":\"ADMIN\",\"displayName\":\"Admin\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertNotEquals(admin.getId(), account.get("userId").asLong());
        assertEquals("GUEST", account.get("role").asText());
        mvc.perform(get("/api/v1/admin/session-probe").header("Authorization", authorization(account)))
                .andExpect(status().isForbidden());
    }

    @Test
    void twoGuestsCanOnlyReadAndChangeTheirOwnTodos() throws Exception {
        JsonNode first = guest(), second = guest();
        JsonNode created = data(mvc.perform(post("/api/v1/todos").contentType("application/json")
                        .header("Authorization", authorization(first)).content("{\"title\":\"First guest todo\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/v1/todos").header("Authorization", authorization(first)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].userId").value(first.get("userId").asLong()));
        mvc.perform(get("/api/v1/todos").header("Authorization", authorization(second)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(delete("/api/v1/todos/" + created.get("id").asText())
                        .header("Authorization", authorization(second)))
                .andExpect(jsonPath("$.code").value(404));
        mvc.perform(get("/api/v1/todos").header("Authorization", authorization(first)))
                .andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    void administratorPasswordLoginAndProtectedAdminAccessStillWork() throws Exception {
        UserEntity admin = administrator("test-admin");
        JsonNode account = data(mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                        .content("{\"username\":\"test-admin\",\"password\":\"test-admin-password\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString());
        assertEquals(admin.getId(), account.get("userId").asLong());
        assertEquals("ADMIN", account.get("role").asText());
        mvc.perform(get("/api/v1/admin/session-probe").header("Authorization", authorization(account)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
        mvc.perform(get("/api/v1/admin/session-probe")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin.css")).andExpect(status().isOk());
        mvc.perform(get("/admin.js")).andExpect(status().isOk());
    }

    @Test
    void missingInvalidAndExpiredTokensReturnUnauthorizedForSessionRenewal() throws Exception {
        JsonNode account = guest();
        String expired = new JwtService("guest-session-test-only-signing-key-0123456789", -1)
                .issue(account.get("userId").asLong(), account.get("guestId").asText(), "GUEST");
        mvc.perform(get("/api/v1/todos")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));
        for (String token : new String[]{"invalid-token", expired}) {
            mvc.perform(get("/api/v1/todos").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(401));
        }
        mvc.perform(get("/api/v1/admin/session-probe").header("Authorization", authorization(account)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(403));
    }
}
