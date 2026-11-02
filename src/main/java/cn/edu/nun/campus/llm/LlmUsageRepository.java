package cn.edu.nun.campus.llm;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public interface LlmUsageRepository extends JpaRepository<LlmUsage, Long> {

    @Query("SELECT COALESCE(SUM(u.costCny), 0) FROM LlmUsage u WHERE u.createdAt >= :since")
    BigDecimal costSince(OffsetDateTime since);

    long countByCreatedAtGreaterThanEqual(OffsetDateTime since);

    /** 按用途统计：purpose, calls, cost */
    @Query("SELECT u.purpose, COUNT(u), COALESCE(SUM(u.costCny), 0) FROM LlmUsage u GROUP BY u.purpose ORDER BY COUNT(u) DESC")
    List<Object[]> sumByPurpose();
}
