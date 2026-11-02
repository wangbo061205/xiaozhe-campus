package cn.edu.nun.campus.course;

import cn.edu.nun.campus.auth.JwtAuthFilter.AuthUser;
import cn.edu.nun.campus.common.ApiResponse;
import cn.edu.nun.campus.common.BizException;
import cn.edu.nun.campus.xiaobei.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.time.LocalDate;
import java.util.*;

import static cn.edu.nun.campus.course.CourseController.CourseReq;

@RestController
@RequestMapping("/api/v1/courses")
public class CourseImportController {
    private final CourseRepository repo;
    private final CourseTimetableSettingsRepository settings;
    private final CourseImportParser parser;
    private final CourseRecognitionService recognition;
    private final XiaobeiService xiaobei;
    public CourseImportController(CourseRepository repo,CourseTimetableSettingsRepository settings,
            CourseImportParser parser,CourseRecognitionService recognition,XiaobeiService xiaobei){
        this.repo=repo;this.settings=settings;this.parser=parser;this.recognition=recognition;this.xiaobei=xiaobei;
    }
    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(BizException e){return ResponseEntity.status(e.getCode()).body(ApiResponse.error(e.getCode(),e.getMessage()));}
    public record SettingsReq(LocalDate termStart){}
    public record ImportReq(@NotEmpty @Size(max=300) List<@Valid CourseReq> courses,LocalDate termStart){}
    public record ImportResult(int added,int skipped){}
    @GetMapping("/settings")
    public ApiResponse<SettingsReq> settings(){return ApiResponse.ok(new SettingsReq(settings.findById(AuthUser.currentId()).map(CourseTimetableSettings::getTermStart).orElse(null)));}
    @PutMapping("/settings")
    @Transactional
    public ApiResponse<SettingsReq> saveSettings(@RequestBody SettingsReq input){saveStart(input.termStart());return ApiResponse.ok(input);}
    private void saveStart(LocalDate date){
        if(date!=null&&(date.getYear()<2000||date.getYear()>2100))throw BizException.badRequest("开学日期应在2000—2100年内");
        var value=settings.findById(AuthUser.currentId()).orElseGet(CourseTimetableSettings::new);
        value.setUserId(AuthUser.currentId());value.setTermStart(date);settings.save(value);
    }
    @PostMapping(value="/import/preview",consumes="multipart/form-data")
    public ApiResponse<CourseImportParser.Parsed> preview(@RequestParam("file")MultipartFile file,
            @RequestParam(defaultValue="file")String source,@RequestParam(required=false)LocalDate termStart,
            @RequestParam(defaultValue="")String fileName)throws java.io.IOException{
        if(!Set.of("file","photo").contains(source))throw BizException.badRequest("请选择文件或照片导入");
        if(file.isEmpty()||file.getSize()>10*1024*1024)throw BizException.badRequest("课表文件大小须在10MB以内");
        byte[]bytes=file.getBytes();
        // WeChat temporary paths can lose the extension. Only use the original name for format selection, never as a path.
        String name=(fileName.isBlank()?Optional.ofNullable(file.getOriginalFilename()).orElse(""):fileName).toLowerCase(Locale.ROOT);
        var parsed=source.equals("photo")?recognition.photo(bytes):name.endsWith(".pdf")?recognition.pdf(bytes):parser.parse(name,bytes,termStart);
        if(termStart!=null)parsed=new CourseImportParser.Parsed(parsed.courses(),parsed.warnings(),termStart);
        return ApiResponse.ok(parsed);
    }
    @PostMapping("/import/education")
    public ApiResponse<CourseImportParser.Parsed> education(@RequestBody(required=false)Map<String,Object>body){
        Map<String,Object>input=new LinkedHashMap<>();
        if(body!=null&&body.get("semester")instanceof String semester&&!semester.isBlank())input.put("semester",semester);
        var result=xiaobei.call(XiaobeiEndpoints.find("jwxt.schedule"),input,AuthUser.currentId());
        return ApiResponse.ok(parser.json(result));
    }
    @PostMapping("/import/confirm")
    @Transactional
    public ApiResponse<ImportResult> confirm(@Valid @RequestBody ImportReq input){
        var parsed=parser.checked(input.courses(),new ArrayList<>(),input.termStart());
        Set<String>known=new HashSet<>();
        for(Course c:repo.findByUserIdOrderByWeekdayAscStartSectAsc(AuthUser.currentId()))known.add(key(c));
        int skipped=0,added=0;
        for(CourseReq row:parsed.courses()){
            Course c=new Course();c.setUserId(AuthUser.currentId());CourseController.apply(c,row);
            if(!known.add(key(c))){skipped++;continue;}
            repo.save(c);added++;
        }
        if(input.termStart()!=null)saveStart(input.termStart());
        return ApiResponse.ok(new ImportResult(added,skipped));
    }
    private String key(Course c){return List.of(c.getName().trim(),Objects.toString(c.getTeacher(),"").trim(),Objects.toString(c.getLocation(),"").trim(),c.getWeekday(),c.getStartSect(),c.getEndSect(),CourseImportParser.normalizeWeeks(c.getWeeks())).toString();}
}
