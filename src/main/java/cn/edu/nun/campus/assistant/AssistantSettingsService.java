package cn.edu.nun.campus.assistant;

import cn.edu.nun.campus.common.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class AssistantSettingsService {
    private static final long SETTINGS_ID = 1L;
    private final AssistantSettingsRepository repository;
    private final ObjectMapper json;

    public AssistantSettingsService(AssistantSettingsRepository repository, ObjectMapper json) {
        this.repository = repository;
        this.json = json;
    }

    public record Settings(
            @NotBlank @Size(max = 40) String name,
            @NotBlank @Size(max = 1200) String greeting,
            @NotBlank @Size(max = 8000) String personaPrompt,
            @NotNull @Size(min = 1, max = 6) List<@NotBlank @Size(max = 100) String> suggestions,
            @NotNull Boolean knowledgeEnabled,
            @NotNull Boolean emotionalSupportEnabled,
            @Size(max = 800) String supportContact,
            @PastOrPresent LocalDate supportContactVerifiedAt) {}

    public record PublicSettings(String name, String greeting, List<String> suggestions,
                                 boolean emotionalSupportEnabled) {}

    public static Settings defaults() {
        return new Settings("小折", "你好，我是小折。校园里的问题、学习压力，或者今天的心情，都可以慢慢和我说。",
                "你是温暖、耐心的校园伙伴小折。用自然简洁的中文交流，先理解对方的处境，再一起找一个容易开始的小步骤。倾听时接纳情绪、不评判，不用空泛的说教或强行乐观。每次最多追问一个问题。",
                List.of("今天有点累，想找人聊聊", "临近期末，帮我安排复习节奏", "校园卡丢了该怎么办？", "我想了解学校的办事指南"),
                true, true, "", null);
    }

    @Transactional(readOnly = true)
    public Settings read() {
        return repository.findById(SETTINGS_ID).map(this::fromEntity).orElseGet(AssistantSettingsService::defaults);
    }

    public PublicSettings publicSettings() {
        Settings value = read();
        return new PublicSettings(value.name(), value.greeting(), value.suggestions(), value.emotionalSupportEnabled());
    }

    @Transactional
    public Settings save(Settings input) {
        String contact = input.supportContact() == null ? "" : input.supportContact().trim();
        if (!contact.isEmpty() && input.supportContactVerifiedAt() == null) {
            throw BizException.badRequest("填写支持联系方式时，请同时填写核实日期");
        }
        if (input.supportContactVerifiedAt() != null && input.supportContactVerifiedAt().isAfter(LocalDate.now())) {
            throw BizException.badRequest("核实日期不能晚于今天");
        }
        AssistantSettings value = repository.findById(SETTINGS_ID).orElseGet(AssistantSettings::new);
        value.setId(SETTINGS_ID);
        value.setName(input.name().trim());
        value.setGreeting(input.greeting().trim());
        value.setPersonaPrompt(input.personaPrompt().trim());
        value.setKnowledgeEnabled(input.knowledgeEnabled());
        value.setEmotionalSupportEnabled(input.emotionalSupportEnabled());
        value.setSupportContact(contact);
        value.setSupportContactVerifiedAt(contact.isEmpty() ? null : input.supportContactVerifiedAt());
        try {
            value.setSuggestions(json.writeValueAsString(input.suggestions().stream().map(String::trim).toList()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法保存助手配置", e);
        }
        return fromEntity(repository.saveAndFlush(value));
    }

    private Settings fromEntity(AssistantSettings value) {
        try {
            List<String> suggestions = json.readValue(value.getSuggestions(), new TypeReference<>() {});
            return new Settings(value.getName(), value.getGreeting(), value.getPersonaPrompt(), List.copyOf(suggestions),
                    value.isKnowledgeEnabled(), value.isEmotionalSupportEnabled(), value.getSupportContact(),
                    value.getSupportContactVerifiedAt());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("助手配置格式错误", e);
        }
    }
}
