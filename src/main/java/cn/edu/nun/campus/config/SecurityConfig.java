package cn.edu.nun.campus.config;

import cn.edu.nun.campus.auth.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtAuthFilter jwtFilter) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, failure) -> {
                    response.setStatus(401);
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"code\":401,\"message\":\"请先建立有效会话\",\"data\":null}");
                })
                .accessDeniedHandler((request, response, failure) -> {
                    response.setStatus(403);
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    response.getWriter().write("{\"code\":403,\"message\":\"无权访问该资源\",\"data\":null}");
                }))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health", "/error").permitAll()
                // 管理后台静态资源；管理 API 仍单独校验角色。
                .requestMatchers("/", "/index.html", "/admin.html", "/admin.css", "/admin.js", "/xiaozhe.html", "/xiaozhe.css", "/xiaozhe.js", "/assets/trianon-paper.webp", "/assets/trianon-camellia.webp", "/favicon.ico").permitAll()
                // 聊天通过自动访客身份隔离；无需用户手工登录。
                .requestMatchers(HttpMethod.POST, "/api/v1/feedback").permitAll()
                // 公开信息搜索与阅读对游客开放
                .requestMatchers(HttpMethod.GET, "/api/v1/search/**", "/api/v1/knowledge/**").permitAll()
                // 公共配置（模型名、AI 标识等）公开
                .requestMatchers(HttpMethod.GET, "/api/v1/config/public").permitAll()
                .requestMatchers("/api/v1/campus/**").permitAll()
                // 失物招领广场公开可读
                .requestMatchers(HttpMethod.GET, "/api/v1/lost-found", "/api/v1/lost-found/images/*").permitAll()
                .requestMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "MODERATOR")
                .anyRequest().authenticated())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
