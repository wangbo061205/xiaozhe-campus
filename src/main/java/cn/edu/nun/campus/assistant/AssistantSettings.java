package cn.edu.nun.campus.assistant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
@Entity
@Table(name = "assistant_settings")
public class AssistantSettings {
    @Id
    private Long id;
    @Column(nullable = false, length = 40)
    private String name;
    @Column(nullable = false, columnDefinition = "text")
    private String greeting;
    @Column(name = "persona_prompt", nullable = false, columnDefinition = "text")
    private String personaPrompt;
    @Column(nullable = false, columnDefinition = "text")
    private String suggestions;
    @Column(name = "knowledge_enabled", nullable = false)
    private boolean knowledgeEnabled;
    @Column(name = "emotional_support_enabled", nullable = false)
    private boolean emotionalSupportEnabled;
    @Column(name = "support_contact", nullable = false, columnDefinition = "text")
    private String supportContact;
    @Column(name = "support_contact_verified_at")
    private LocalDate supportContactVerifiedAt;
}
