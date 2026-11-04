package cn.edu.nun.campus.lostfound;

import cn.edu.nun.campus.auth.JwtService;
import cn.edu.nun.campus.auth.UserEntity;
import cn.edu.nun.campus.auth.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.config.import=", "spring.datasource.url=jdbc:h2:mem:databaseimages;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.upload.storage=database",
        "app.jwt.secret=test-only-jwt-secret-01234567890123456789"
})
@AutoConfigureMockMvc
@Transactional
class LostFoundDatabaseImagesTest {
    @TempDir static Path directory;
    @DynamicPropertySource static void storage(DynamicPropertyRegistry properties) {
        properties.add("app.upload.lost-found-dir", () -> directory.toString());
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired LostFoundImageContentRepository contents;
    @Autowired LostFoundImageRepository images;
    @Autowired LostFoundRepository posts;

    @Test void keepsPixelsOutsideTheContainerAndRetainsThePublicationPermissionChecks() throws Exception {
        var owner = new UserEntity();
        owner.setUsername(UUID.randomUUID().toString()); owner.setPasswordHash("test-only"); owner.setDisplayName("Cloud image test");
        Long ownerId = users.saveAndFlush(owner).getId();
        String auth = "Bearer " + jwt.issue(ownerId, "owner", "GUEST");
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(24, 32, BufferedImage.TYPE_INT_RGB), "png", output);
        var uploaded = json.readTree(mvc.perform(multipart("/api/v1/lost-found/images")
                .file(new MockMultipartFile("file", "photo.png", "image/png", output.toByteArray()))
                .header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        UUID imageId = UUID.fromString(uploaded.get("id").asText());
        String url = uploaded.get("url").asText();
        byte[] saved = contents.findById(imageId).orElseThrow().getData();
        assertTrue(saved.length > 8);
        try (var files = Files.list(directory)) { assertEquals(0, files.count()); }
        mvc.perform(get(url)).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(content().contentType("image/png")).andExpect(content().bytes(saved));
        var post = new LostFound();
        post.setUserId(ownerId); post.setKind(LostFound.Kind.LOST); post.setTitle("Notebook"); post.setStatus(LostFound.Status.PUBLISHED);
        Long postId = posts.saveAndFlush(post).getId();
        var metadata = images.findById(imageId).orElseThrow();
        metadata.setLostFoundId(postId); images.saveAndFlush(metadata);
        mvc.perform(get(url)).andExpect(status().isOk()).andExpect(content().bytes(saved));
        post.setStatus(LostFound.Status.CLOSED); posts.saveAndFlush(post);
        mvc.perform(get(url)).andExpect(status().isForbidden());
    }
}
