package cn.edu.nun.campus.auth;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final GuestSessionService guests;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt, GuestSessionService guests) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.guests = guests;
    }

    public record LoginReq(@NotBlank String username, @NotBlank String password) {}
    public record LoginRes(String token, Long userId, String displayName, String role) {}
    public record RegisterReq(@NotBlank @Size(min = 3, max = 64) String username,
                              @NotBlank @Size(min = 6, max = 100) String password,
                              @NotBlank @Size(max = 64) String displayName) {}
    public record GuestReq(@Size(max = 64) String guestId, @Size(max = 128) String guestSecret) {
        @AssertTrue(message = "guestId 与 guestSecret 必须同时提供")
        public boolean isCredentialPairComplete() {
            return (guestId == null && guestSecret == null)
                    || (guestId != null && !guestId.isBlank() && guestSecret != null && !guestSecret.isBlank());
        }
    }
    public record GuestRes(String token, Long userId, String displayName, String role,
                           String guestId, String guestSecret) {}

    @PostMapping("/guest")
    public ApiResponse<GuestRes> guest(@Valid @RequestBody GuestReq req) {
        return ApiResponse.ok(guests.open(req.guestId(), req.guestSecret()));
    }

    @ExceptionHandler(GuestSessionService.InvalidGuestSession.class)
    public ResponseEntity<ApiResponse<Void>> invalidGuest() {
        return ResponseEntity.status(401).body(ApiResponse.error(401, "访客凭证无效，请重新创建访客会话"));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> invalidRequestBody() {
        return ResponseEntity.badRequest().body(ApiResponse.error(400, "请求参数格式不正确"));
    }

    @PostMapping("/login")
    public ApiResponse<LoginRes> login(@Valid @RequestBody LoginReq req) {
        if (GuestSessionService.isGuestUsername(req.username())) {
            throw BizException.badRequest("用户名或密码错误");
        }
        UserEntity u = users.findByUsername(req.username())
                .filter(UserEntity::isEnabled)
                .filter(user -> user.getRole() != UserEntity.Role.GUEST)
                .orElseThrow(() -> BizException.badRequest("用户名或密码错误"));
        if (!encoder.matches(req.password(), u.getPasswordHash())) {
            throw BizException.badRequest("用户名或密码错误");
        }
        String token = jwt.issue(u.getId(), u.getUsername(), u.getRole().name());
        return ApiResponse.ok(new LoginRes(token, u.getId(), u.getDisplayName(), u.getRole().name()));
    }

    @PostMapping("/register")
    public ApiResponse<LoginRes> register(@Valid @RequestBody RegisterReq req) {
        if (GuestSessionService.isGuestUsername(req.username())) {
            throw BizException.badRequest("该用户名不可用于注册");
        }
        if (users.existsByUsername(req.username())) {
            throw BizException.badRequest("用户名已存在");
        }
        UserEntity u = new UserEntity();
        u.setUsername(req.username());
        u.setPasswordHash(encoder.encode(req.password()));
        u.setDisplayName(req.displayName());
        u.setRole(UserEntity.Role.STUDENT);
        users.save(u);
        String token = jwt.issue(u.getId(), u.getUsername(), u.getRole().name());
        return ApiResponse.ok(new LoginRes(token, u.getId(), u.getDisplayName(), u.getRole().name()));
    }
}
