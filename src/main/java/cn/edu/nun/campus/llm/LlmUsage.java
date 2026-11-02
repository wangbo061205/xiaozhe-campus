package cn.edu.nun.campus.llm;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Getter
@Setter
@Entity
@Table(name = "llm_usage")
public class LlmUsage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 32)
    private String provider;

    @Column(nullable = false, length = 64)
    private String model;

    @Column(name = "prompt_tokens", nullable = false)
    private int promptTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @Column(name = "cost_cny", nullable = false, precision = 10, scale = 6)
    private BigDecimal costCny = BigDecimal.ZERO;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(nullable = false)
    private boolean success;

    @Column(length = 64)
    private String purpose;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
