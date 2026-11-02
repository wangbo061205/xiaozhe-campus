package cn.edu.nun.campus.assistant;

import cn.edu.nun.campus.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/assistant-settings")
@PreAuthorize("hasRole('ADMIN')")
public class AssistantSettingsController {
    private final AssistantSettingsService settings;

    public AssistantSettingsController(AssistantSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    public ApiResponse<AssistantSettingsService.Settings> read() {
        return ApiResponse.ok(settings.read());
    }

    @PutMapping
    public ApiResponse<AssistantSettingsService.Settings> save(
            @Valid @RequestBody AssistantSettingsService.Settings input) {
        return ApiResponse.ok(settings.save(input));
    }
}
