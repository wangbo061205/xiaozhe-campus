package cn.edu.nun.campus.course;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** 用户私有课表，导入与修改共用相同校验。 */
@RestController
@RequestMapping("/api/v1/courses")
public class CourseController {

    public record CourseReq(@NotBlank @Size(max=128) String name, @Size(max=64) String teacher,
                            @Size(max=128) String location, @NotNull @Min(1) @Max(7) Integer weekday,
                            @NotNull @Min(1) @Max(12) Integer startSect,
                            @NotNull @Min(1) @Max(12) Integer endSect, @Size(max=64) String weeks) {}

    private final CourseRepository repo;
    private final CourseTimetableSettingsRepository settings;

    public CourseController(CourseRepository repo,CourseTimetableSettingsRepository settings) {
        this.repo = repo;
        this.settings = settings;
    }

    @GetMapping
    public ApiResponse<List<Course>> mine() {
        return ApiResponse.ok(repo.findByUserIdOrderByWeekdayAscStartSectAsc(AuthUser.currentId()));
    }

    /** 今日课程（按服务器日期） */
    @GetMapping("/today")
    public ApiResponse<List<Course>> today() {
        LocalDate date=LocalDate.now(ZoneId.of("Asia/Shanghai"));
        int dow = date.getDayOfWeek().getValue();
        LocalDate start=settings.findById(AuthUser.currentId()).map(CourseTimetableSettings::getTermStart).orElse(null);
        Integer week=start==null?null:(int)java.time.temporal.ChronoUnit.WEEKS.between(
            start.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)),
            date.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)))+1;
        return ApiResponse.ok(repo.findByUserIdAndWeekdayOrderByStartSectAsc(AuthUser.currentId(), dow).stream()
            .filter(c->occurs(c,week)).toList());
    }

    static boolean occurs(Course course,Integer week) {
        if(week==null)return true;
        if(week<1||week>60)return false;
        try { var weeks=CourseImportParser.weekNumbers(course.getWeeks());return weeks.isEmpty()||weeks.contains(week); }
        catch(cn.edu.nun.campus.common.BizException ignored) { return false; }
    }

    @PostMapping
    public ApiResponse<Course> add(@Valid @RequestBody CourseReq req) {
        Course c = new Course();
        c.setUserId(AuthUser.currentId());
        apply(c,req);
        return ApiResponse.ok(repo.save(c));
    }

    @PutMapping("/{id}")
    public ApiResponse<Course> update(@PathVariable Long id, @Valid @RequestBody CourseReq req) {
        Course c = repo.findById(id).orElseThrow(() -> BizException.notFound("课程"));
        if (!c.getUserId().equals(AuthUser.currentId())) throw BizException.forbidden("只能修改自己的课程");
        apply(c,req);
        return ApiResponse.ok(repo.save(c));
    }

    static void apply(Course c, CourseReq req) {
        CourseImportParser.validate(req);
        c.setName(req.name().trim());
        c.setTeacher(req.teacher()==null?"":req.teacher().trim());
        c.setLocation(req.location()==null?"":req.location().trim());
        c.setWeekday(req.weekday());
        c.setStartSect(req.startSect());
        c.setEndSect(req.endSect());
        c.setWeeks(CourseImportParser.normalizeWeeks(req.weeks()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> remove(@PathVariable Long id) {
        Course c = repo.findById(id).orElseThrow(() -> BizException.notFound("课程"));
        if (!c.getUserId().equals(AuthUser.currentId())) throw BizException.forbidden("只能删除自己的课程");
        repo.delete(c);
        return ApiResponse.ok();
    }
}

@Repository
interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findByUserIdOrderByWeekdayAscStartSectAsc(Long userId);
    List<Course> findByUserIdAndWeekdayOrderByStartSectAsc(Long userId, Integer weekday);
}
