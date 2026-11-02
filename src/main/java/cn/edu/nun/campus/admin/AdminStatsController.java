package cn.edu.nun.campus.admin;

import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.llm.LlmUsage;
import cn.edu.nun.campus.llm.LlmUsageRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 管理后台：模型调用量与成本统计（PROJECT §6.2 / §14.4） */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminStatsController {

    private final LlmUsageRepository repo;

    public AdminStatsController(LlmUsageRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/usage")
    @PreAuthorize("hasAnyRole('ADMIN','MODERATOR')")
    public ApiResponse<Map<String, Object>> usage() {
        OffsetDateTime dayAgo = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);
        OffsetDateTime weekAgo = dayAgo.minusDays(7);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalCostCny", nz(repo.costSince(OffsetDateTime.now().minusYears(10))));
        out.put("todayCostCny", nz(repo.costSince(dayAgo)));
        out.put("weekCostCny", nz(repo.costSince(weekAgo)));
        out.put("totalCalls", repo.count());
        out.put("todayCalls", repo.countByCreatedAtGreaterThanEqual(dayAgo));

        List<Map<String, Object>> byPurpose = repo.sumByPurpose().stream().map(row -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("purpose", row[0] == null ? "unknown" : row[0]);
            m.put("calls", row[1]);
            m.put("costCny", row[2]);
            return m;
        }).toList();
        out.put("byPurpose", byPurpose);
        return ApiResponse.ok(out);
    }

    private BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(4, java.math.RoundingMode.HALF_UP);
    }
}
