package cn.edu.nun.campus.knowledge;

import cn.edu.nun.campus.auth.JwtAuthFilter;
import cn.edu.nun.campus.auth.JwtService;
import cn.edu.nun.campus.common.GlobalExceptionHandler;
import cn.edu.nun.campus.config.SecurityConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = KnowledgeLibraryTest.Application.class, properties = {
        "spring.config.location=optional:classpath:/knowledge-library-test-only.properties",
        "spring.config.import=",
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration",
        "spring.datasource.url=jdbc:h2:mem:knowledgelibrary;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.open-in-view=false",
        "app.jwt.secret=knowledge-library-test-key-01234567890123456789", "app.jwt.expire-minutes=120"
})
@AutoConfigureMockMvc
@Transactional
class KnowledgeLibraryTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @EntityScan(basePackageClasses = KnowledgeItem.class)
    @EnableJpaRepositories(basePackageClasses = KnowledgeRepository.class)
    @Import({KnowledgeLibraryController.class, JwtService.class, JwtAuthFilter.class, SecurityConfig.class, GlobalExceptionHandler.class})
    static class Application {}

    @Autowired KnowledgeRepository repository;
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;

    private String auth(String role) { return "Bearer " + jwt.issue(1L, "test", role); }
    private KnowledgeItem item(String title, String body, String category, String date) {
        var item = new KnowledgeItem();
        item.setTitle(title); item.setContent(body); item.setSourceCategory(category);
        item.setSourceSite("yjsc"); item.setType(KnowledgeItem.Type.NOTICE);
        item.setStatus(KnowledgeItem.Status.PUBLISHED);
        item.setPublishedAt(OffsetDateTime.parse(date));
        return repository.saveAndFlush(item);
    }

    @BeforeEach void prepare() {
        item("2025招生简章", "报名条件与申请材料", "硕士招生", "2025-09-01T00:00:00+08:00");
        item("2026招生简章", "奖学金条件", "硕士招生", "2026-09-01T00:00:00+08:00");
        var draft = item("待发布教务通知", "招生条件", "培养管理", "2026-10-01T00:00:00+08:00");
        draft.setStatus(KnowledgeItem.Status.PENDING_REVIEW); repository.saveAndFlush(draft);
    }

    @Test void paginatesAcrossWholeLibraryAndFiltersInDatabase() throws Exception {
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("ADMIN"))
                        .param("q","招生简章").param("page","1").param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.page").value(1));
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("MODERATOR"))
                        .param("q","申请材料").param("status","PUBLISHED").param("category","硕士招生"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].title").value("2025招生简章"));
    }

    @Test void guestCannotReadDraftsAndInvalidFiltersDoNotFetchAll() throws Exception {
        mvc.perform(get("/api/v1/admin/knowledge/page")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("GUEST")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("ADMIN")).param("size","0"))
                .andExpect(jsonPath("$.code").value(400));
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("ADMIN")).param("status","BAD"))
                .andExpect(jsonPath("$.code").value(400));
        mvc.perform(get("/api/v1/admin/knowledge/page").header("Authorization",auth("ADMIN")).param("q","%"))
                .andExpect(jsonPath("$.data.total").value(0));
    }

    @Test void latestPublishedUsesOriginalDateAndOmitsExpiredAndDrafts() {
        var expired = item("过期通知", "历史资料", "通知公告", "2026-10-20T00:00:00+08:00");
        expired.setExpiresAt(OffsetDateTime.now().minusDays(1)); repository.saveAndFlush(expired);
        var result = repository.latestPublished(null, PageRequest.of(0,50));
        assertEquals(2,result.size()); assertEquals("2026招生简章",result.getFirst().getTitle());
        assertEquals(2026,result.getFirst().getPublishedAt().getYear());
    }
}
