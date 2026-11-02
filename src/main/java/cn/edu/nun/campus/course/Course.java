package cn.edu.nun.campus.course;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** 用户私有课表；导入后允许逐门修改。 */
@Getter
@Setter
@Entity
@Table(name = "course")
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(length = 64)
    private String teacher;

    @Column(length = 128)
    private String location;

    @Column(nullable = false)
    private Integer weekday;          // 1=周一 … 7=周日

    @Column(name = "start_sect", nullable = false)
    private Integer startSect;        // 起始节次

    @Column(name = "end_sect", nullable = false)
    private Integer endSect;          // 结束节次

    @Column(length = 64)
    private String weeks;             // 如 "1-16"（选填）

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
