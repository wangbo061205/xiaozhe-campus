package cn.edu.nun.campus.knowledge;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/knowledge/import")
@PreAuthorize("hasRole('ADMIN')")
public class KnowledgeImportController {
    private final KnowledgeImportService imports;

    public KnowledgeImportController(KnowledgeImportService imports) {
        this.imports = imports;
    }

    @PostMapping
    public ApiResponse<KnowledgeImportService.Result> importBatch(
            @Valid @RequestBody KnowledgeImportService.Batch batch) {
        return ApiResponse.ok(imports.importBatch(batch, AuthUser.currentId()));
    }
}
