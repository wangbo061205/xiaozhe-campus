package cn.edu.nun.campus.auth;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

@Service
public class GuestSessionService {
    private static final String DISPLAY_NAME = "校园访客";
    private final SecureRandom random = new SecureRandom();
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public GuestSessionService(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    public static boolean isGuestUsername(String username) {
        return username != null && username.regionMatches(true, 0, "guest_", 0, 6);
    }

    @Transactional
    public AuthController.GuestRes open(String guestId, String guestSecret) {
        UserEntity user;
        String secret;
        if (guestId == null && guestSecret == null) {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            secret = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            user = new UserEntity();
            user.setUsername("guest_" + UUID.randomUUID());
            user.setPasswordHash(encoder.encode(secret));
            user.setDisplayName(DISPLAY_NAME);
            user.setRole(UserEntity.Role.GUEST);
            user = users.save(user);
        } else {
            if (guestId == null || guestSecret == null || guestId.length() > 64
                    || !guestSecret.matches("[A-Za-z0-9_-]{43}") || !isGuestUsername(guestId)) {
                throw new InvalidGuestSession();
            }
            user = users.findByUsername(guestId)
                    .filter(UserEntity::isEnabled)
                    .filter(account -> account.getRole() == UserEntity.Role.GUEST)
                    .filter(account -> encoder.matches(guestSecret, account.getPasswordHash()))
                    .orElseThrow(InvalidGuestSession::new);
            secret = guestSecret;
        }
        // Identity and role always come from the server-side guest account.
        String token = jwt.issue(user.getId(), user.getUsername(), UserEntity.Role.GUEST.name());
        return new AuthController.GuestRes(token, user.getId(), DISPLAY_NAME,
                UserEntity.Role.GUEST.name(), user.getUsername(), secret);
    }

    public static final class InvalidGuestSession extends RuntimeException {}
}
