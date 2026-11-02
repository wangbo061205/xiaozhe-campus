package cn.edu.nun.campus.course;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;

@Entity
@Table(name="course_timetable_settings")
@Getter @Setter
public class CourseTimetableSettings {
    @Id @Column(name="user_id") private Long userId;
    @Column(name="term_start") private LocalDate termStart;
}

interface CourseTimetableSettingsRepository extends JpaRepository<CourseTimetableSettings,Long> {}
