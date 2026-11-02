package cn.edu.nun.campus.auth;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(header.substring(7));
                Long userId = Long.valueOf(claims.getSubject());
                String role = claims.get("role", String.class);
                var auth = new UsernamePasswordAuthenticationToken(
                        new AuthUser(userId, claims.get("username", String.class), role),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception ignored) {
                // 无效 token 按未认证处理
            }
        }
        chain.doFilter(req, res);
    }

    public record AuthUser(Long id, String username, String role) {
        public static AuthUser current() {
            var a = SecurityContextHolder.getContext().getAuthentication();
            if (a == null || !(a.getPrincipal() instanceof AuthUser u)) {
                return null;
            }
            return u;
        }

        public static Long currentId() {
            AuthUser u = current();
            return u == null ? null : u.id();
        }
    }
}
