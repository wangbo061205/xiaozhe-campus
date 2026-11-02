package cn.edu.nun.campus.lostfound;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.*;

@Service
public class LostFoundImageService {
    public static final int MAX_IMAGES = 6;
    public static final long MAX_BYTES = 5 * 1024 * 1024;
    private final LostFoundImageRepository images;
    private final LostFoundRepository posts;
    private final ObjectMapper json;
    private final Path storage;

    public LostFoundImageService(LostFoundImageRepository images, LostFoundRepository posts, ObjectMapper json,
                                @Value("${app.upload.lost-found-dir:./data/lost-found-images}") String directory) {
        this.images = images;
        this.posts = posts;
        this.json = json;
        this.storage = Path.of(directory).toAbsolutePath().normalize();
    }

    public record Uploaded(UUID id, String url, int width, int height) {}
    public Uploaded upload(MultipartFile file, Long userId) throws IOException {
        if (userId == null) throw new AccessDeniedException("请先登录");
        if (file == null || file.isEmpty()) throw BizException.badRequest("请选择图片");
        if (file.getSize() > MAX_BYTES) throw BizException.badRequest("每张图片不能超过 5MB");
        BufferedImage bitmap;
        String format;
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(file.getBytes()))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw BizException.badRequest("请上传 JPG 或 PNG 图片");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "jpg", "png").contains(format)) throw BizException.badRequest("请上传 JPG 或 PNG 图片");
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 10000 || height > 10000 || (long) width * height > 24_000_000)
                    throw BizException.badRequest("图片尺寸过大，请压缩后上传");
                bitmap = reader.read(0);
            } finally { reader.dispose(); }
        } catch (IOException e) { throw BizException.badRequest("图片损坏，请重新选择"); }
        UUID id = UUID.randomUUID();
        String extension = format.equals("png") ? "png" : "jpg";
        String key = id + "." + extension;
        Files.createDirectories(storage);
        Path target = storage.resolve(key);
        try {
            // Re-encode pixels to remove EXIF metadata and never retain the supplied filename.
            try (var output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                if (!ImageIO.write(bitmap, extension, output)) throw new IOException("Image encoder unavailable");
            }
            var image = new LostFoundImage();
            image.setId(id); image.setUserId(userId); image.setStorageKey(key);
            image.setWidth(bitmap.getWidth()); image.setHeight(bitmap.getHeight());
            image.setContentType(extension.equals("png") ? "image/png" : "image/jpeg");
            images.saveAndFlush(image);
            return new Uploaded(id, url(id), bitmap.getWidth(), bitmap.getHeight());
        } catch (IOException | RuntimeException e) { Files.deleteIfExists(target); throw e; }
    }

    @Transactional
    public List<LostFoundImage> validateAttachments(List<UUID> ids, Long userId) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > MAX_IMAGES || ids.contains(null) || new HashSet<>(ids).size() != ids.size())
            throw BizException.badRequest("最多添加 6 张图片，不能重复添加");
        var found = images.lockAllByIds(ids);
        if (found.size() != ids.size()) throw BizException.badRequest("部分图片不存在，请重新上传");
        if (found.stream().anyMatch(i -> !Objects.equals(i.getUserId(), userId) || i.getLostFoundId() != null))
            throw BizException.forbidden("只能使用自己上传且尚未发布的图片");
        // Preserve the user's chosen order, independently of the database lock order.
        var byId = new HashMap<UUID, LostFoundImage>();
        found.forEach(i -> byId.put(i.getId(), i));
        return ids.stream().map(byId::get).toList();
    }

    public String attach(List<LostFoundImage> files, Long postId) {
        files.forEach(i -> i.setLostFoundId(postId));
        images.saveAll(files);
        try { return json.writeValueAsString(files.stream().map(i -> url(i.getId())).toList()); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    public ResponseEntity<FileSystemResource> read(UUID id, AuthUser user) {
        var image = images.findById(id).orElseThrow(() -> BizException.notFound("图片"));
        boolean owner = user != null && Objects.equals(image.getUserId(), user.id());
        boolean moderator = user != null && Set.of("ADMIN", "MODERATOR").contains(user.role());
        boolean published = image.getLostFoundId() != null && posts.findById(image.getLostFoundId())
                .map(p -> p.getStatus() == LostFound.Status.PUBLISHED).orElse(false);
        if (!published && !owner && !moderator) throw new AccessDeniedException("该图片尚未公开");
        var file = storage.resolve(image.getStorageKey()).normalize();
        if (!file.startsWith(storage) || !Files.isRegularFile(file)) throw BizException.notFound("图片");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.getContentType()))
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(file));
    }
    private String url(UUID id) { return "/api/v1/lost-found/images/" + id; }
}
