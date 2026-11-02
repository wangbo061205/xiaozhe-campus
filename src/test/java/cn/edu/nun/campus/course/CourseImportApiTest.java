package cn.edu.nun.campus.course;

import cn.edu.nun.campus.auth.JwtAuthFilter;
import cn.edu.nun.campus.auth.JwtService;
import cn.edu.nun.campus.common.GlobalExceptionHandler;
import cn.edu.nun.campus.config.SecurityConfig;
import cn.edu.nun.campus.xiaobei.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes=CourseImportApiTest.TestApplication.class,properties={
    "spring.config.location=optional:classpath:/course-import-test.properties", "spring.config.import=",
    "spring.datasource.url=jdbc:h2:mem:courseimport;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa","spring.datasource.password=", "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.open-in-view=false",
    "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration",
    "app.jwt.secret=course-import-test-signing-key-01234567890123456789","app.jwt.expire-minutes=120"
})
@AutoConfigureMockMvc @Transactional
class CourseImportApiTest {
    @Configuration(proxyBeanMethods=false) @EnableAutoConfiguration
    @EntityScan(basePackageClasses=Course.class) @EnableJpaRepositories(basePackageClasses=CourseRepository.class)
    @Import({CourseController.class,CourseImportController.class,CourseImportParser.class,JwtService.class,JwtAuthFilter.class,SecurityConfig.class,GlobalExceptionHandler.class,XiaobeiErrorHandler.class})
    static class TestApplication {
        @Bean CourseRecognitionService recognition(){return mock(CourseRecognitionService.class);}
        @Bean XiaobeiService xiaobei(){return mock(XiaobeiService.class);}
    }
    @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired JwtService jwt;
    @Autowired CourseRepository repo; @Autowired XiaobeiService xiaobei;
    String auth(long id){return "Bearer "+jwt.issue(id,"guest_test","GUEST");}
    Map<String,Object> course(){return Map.of("name","大学物理II","weekday",2,"startSect",1,"endSect",2,"weeks","1-16","teacher","马老师","location","160212");}
    @Test void previewHasNoWritesAndConfirmedImportDeduplicates()throws Exception{
        var file=new MockMultipartFile("file","课程.csv","text/csv","课程名称,星期,节次\n大学物理II,周二,1-2".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/v1/courses/import/preview").file(file)).andExpect(status().isUnauthorized());
        var temporary=new MockMultipartFile("file","wx-temp-123","application/octet-stream",file.getBytes());
        mvc.perform(multipart("/api/v1/courses/import/preview").file(temporary).param("fileName","课程.csv").header("Authorization",auth(101)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.courses[0].weekday").value(2));
        assertEquals(0,repo.count());
        String body=json.writeValueAsString(Map.of("courses",List.of(course()),"termStart","2026-08-31"));
        for(int i=0;i<2;i++)mvc.perform(post("/api/v1/courses/import/confirm").header("Authorization",auth(101)).contentType("application/json").content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.added").value(i==0?1:0)).andExpect(jsonPath("$.data.skipped").value(i==0?0:1));
        assertEquals(1,repo.count());
        mvc.perform(get("/api/v1/courses").header("Authorization",auth(102))).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(get("/api/v1/courses/settings").header("Authorization",auth(102))).andExpect(jsonPath("$.data.termStart").isEmpty());
        long id=repo.findAll().getFirst().getId();
        mvc.perform(put("/api/v1/courses/"+id).header("Authorization",auth(102)).contentType("application/json").content(json.writeValueAsString(course())))
            .andExpect(jsonPath("$.code").value(403));
        var changed=new HashMap<>(course());changed.put("location","150115");
        mvc.perform(put("/api/v1/courses/"+id).header("Authorization",auth(101)).contentType("application/json").content(json.writeValueAsString(changed)))
            .andExpect(jsonPath("$.data.location").value("150115"));
    }
    @Test void invalidImportIsAtomic()throws Exception{
        var wrong=new HashMap<>(course());wrong.put("startSect",8);wrong.put("endSect",2);
        mvc.perform(post("/api/v1/courses/import/confirm").header("Authorization",auth(101)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("courses",List.of(course(),wrong)))))
            .andExpect(status().isBadRequest());
        assertEquals(0,repo.count());
    }
    @Test void educationUsesOnlyTheCurrentIdentityAndStillPreviews()throws Exception{
        when(xiaobei.call(any(),anyMap(),eq(201L))).thenReturn(json.readTree("{\"courses\":[{\"courseName\":\"数学分析\",\"weekday\":1,\"startSection\":5,\"endSection\":6,\"weekText\":\"1-16\"}]}"));
        mvc.perform(post("/api/v1/courses/import/education").header("Authorization",auth(201)).contentType("application/json").content("{\"ext_user_id\":\"someone-else\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.courses[0].name").value("数学分析"));
        verify(xiaobei).call(argThat(e->e.key().equals("jwxt.schedule")),eq(Map.of()),eq(201L));assertEquals(0,repo.count());
    }
    @Test void unlinkedEducationReturnsTheActionableUpstreamError()throws Exception{
        when(xiaobei.call(any(),anyMap(),eq(202L))).thenThrow(new XiaobeiException(403,"JWXT_NOT_LINKED","请先关联教务账号","test-request"));
        mvc.perform(post("/api/v1/courses/import/education").header("Authorization",auth(202)).contentType("application/json").content("{}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("JWXT_NOT_LINKED"))
            .andExpect(jsonPath("$.message").value("请先关联教务账号"));
        assertEquals(0,repo.count());
    }
}
