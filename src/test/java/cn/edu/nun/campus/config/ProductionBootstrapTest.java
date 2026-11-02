package cn.edu.nun.campus.config;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ProductionBootstrapTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private static final String JWT = "production-fixture-only-".repeat(4);
    private static final String DATABASE = "database-fixture-only-password";
    private static final String ADMINISTRATOR = "administrator-fixture-only-password";

    @Test
    void refusesDevelopmentSecretsBeforeReadingOrChangingTheDatabase() {
        for (String[] values : new String[][] {
                {"please-change-me-0123456789abcdef0123456789abcdef", DATABASE, ADMINISTRATOR},
                {JWT, "campus_dev_pwd", ADMINISTRATOR}, {JWT, DATABASE, "admin123"}}) {
            var bootstrap = new ProductionBootstrap(jdbc, encoder, values[0], values[1], values[2]);
            assertThrows(IllegalStateException.class, bootstrap::afterPropertiesSet);
        }
        verifyNoInteractions(jdbc);
    }

    @Test
    void replacesTheSeedPasswordButPreservesAnImportedAdministratorsPassword() {
        String defaultHash = encoder.encode("admin123");
        String importedHash = encoder.encode("already-customized-fixture");
        when(jdbc.queryForList(any(String.class))).thenReturn(List.of(
                Map.of("id", 1L, "password_hash", defaultHash), Map.of("id", 2L, "password_hash", importedHash)));
        new ProductionBootstrap(jdbc, encoder, JWT, DATABASE, ADMINISTRATOR).afterPropertiesSet();
        verify(jdbc).update(any(String.class), any(String.class), eq(1L), eq(defaultHash));
        verify(jdbc, never()).update(any(String.class), any(String.class), eq(2L), eq(importedHash));
    }
}
