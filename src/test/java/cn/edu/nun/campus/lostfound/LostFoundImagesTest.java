package cn.edu.nun.campus.lostfound;

import cn.edu.nun.campus.auth.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.config.import=", "spring.datasource.url=jdbc:h2:mem:lostimages;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.jwt.secret=test-only-jwt-secret-01234567890123456789"
})
@AutoConfigureMockMvc
@Transactional
class LostFoundImagesTest {
    @TempDir static Path storage;
    @DynamicPropertySource static void storage(DynamicPropertyRegistry properties) {
        properties.add("app.upload.lost-found-dir", () -> storage.toString());
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    @Autowired LostFoundRepository posts;
    @Autowired LostFoundImageRepository images;
    private Long owner, other;

    @BeforeEach void accounts() {
        owner = account(); other = account();
    }
    private Long account() {
        var user = new UserEntity();
        user.setUsername(UUID.randomUUID().toString()); user.setPasswordHash("test-only"); user.setDisplayName("Image test");
        return users.saveAndFlush(user).getId();
    }
    private String auth(Long id) { return "Bearer " + jwt.issue(id, "test", "STUDENT"); }
    private String moderator() { return "Bearer " + jwt.issue(other, "reviewer", "MODERATOR"); }
    private MockMultipartFile png() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(32, 24, BufferedImage.TYPE_INT_RGB), "png", output);
        return new MockMultipartFile("file", "../../unsafe-name.png", "image/png", output.toByteArray());
    }
    private JsonNode upload() throws Exception {
        return json.readTree(mvc.perform(multipart("/api/v1/lost-found/images").file(png()).header("Authorization", auth(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0)).andReturn().getResponse().getContentAsString()).get("data");
    }
    private String postBody(List<String> ids) throws Exception {
        return json.writeValueAsString(Map.of("kind", "LOST", "title", "Lost notebook", "description", "Blue cover", "imageIds", ids));
    }

    @Test void uploadRequiresSessionAndValidPixels() throws Exception {
        mvc.perform(multipart("/api/v1/lost-found/images").file(png())).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/v1/lost-found/images")
                .file(new MockMultipartFile("file", "fake.png", "image/png", "not an image".getBytes()))
                .header("Authorization", auth(owner))).andExpect(status().isBadRequest());
        assertEquals(0, images.count());
    }
    @Test void uploadedImagesStayPrivateUntilReviewAndBecomePrivateWhenRemoved() throws Exception {
        var uploaded = upload();
        String url = uploaded.get("url").asText();
        assertEquals(32, uploaded.get("width").asInt());
        assertEquals(24, uploaded.get("height").asInt());
        mvc.perform(get(url)).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Authorization", auth(owner))).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        mvc.perform(get(url).header("Authorization", auth(other))).andExpect(status().isForbidden());
        var posted = json.readTree(mvc.perform(post("/api/v1/lost-found").contentType("application/json")
                .header("Authorization", auth(owner)).content(postBody(List.of(uploaded.get("id").asText()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString()).get("data");
        assertEquals(url, json.readTree(posted.get("images").asText()).get(0).asText());
        mvc.perform(get(url)).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Authorization", moderator())).andExpect(status().isOk());
        String review = "/api/v1/lost-found/admin/lost-found/" + posted.get("id").asText() + "/review";
        mvc.perform(post(review).param("approve", "true").header("Authorization", moderator())).andExpect(status().isOk());
        mvc.perform(get(url)).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        mvc.perform(post(review).param("approve", "false").header("Authorization", moderator())).andExpect(status().isOk());
        mvc.perform(get(url)).andExpect(status().isForbidden());
        var record = images.findById(UUID.fromString(uploaded.get("id").asText())).orElseThrow();
        assertTrue(Files.isRegularFile(storage.resolve(record.getStorageKey())));
        assertFalse(record.getStorageKey().contains("unsafe-name"));
    }
    @Test void rejectsForeignDuplicateMissingAndTooManyAttachments() throws Exception {
        String id = upload().get("id").asText();
        mvc.perform(post("/api/v1/lost-found").contentType("application/json").header("Authorization", auth(other))
                .content(postBody(List.of(id)))).andExpect(status().isForbidden());
        for (var ids : List.of(List.of(id, id), List.of(UUID.randomUUID().toString()), Collections.nCopies(7, id))) {
            mvc.perform(post("/api/v1/lost-found").contentType("application/json").header("Authorization", auth(owner))
                    .content(postBody(ids))).andExpect(status().isBadRequest());
        }
        assertEquals(0, posts.count());
    }
    @Test void rejectsOversizedFilesAndPreservesChosenOrder() throws Exception {
        mvc.perform(multipart("/api/v1/lost-found/images")
                .file(new MockMultipartFile("file", "large.png", "image/png", new byte[(int) LostFoundImageService.MAX_BYTES + 1]))
                .header("Authorization", auth(owner))).andExpect(status().isBadRequest());
        var first = upload(); var second = upload();
        String body = mvc.perform(post("/api/v1/lost-found").contentType("application/json").header("Authorization", auth(owner))
                .content(postBody(List.of(second.get("id").asText(), first.get("id").asText()))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var paths = json.readTree(json.readTree(body).get("data").get("images").asText());
        assertEquals(second.get("url").asText(), paths.get(0).asText());
        assertEquals(first.get("url").asText(), paths.get(1).asText());
        mvc.perform(post("/api/v1/lost-found").contentType("application/json").header("Authorization", auth(owner))
                .content(postBody(List.of(first.get("id").asText())))).andExpect(status().isForbidden());
    }
}
