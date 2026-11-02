package cn.edu.nun.campus.course;

import cn.edu.nun.campus.common.BizException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.charset.Charset;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.*;

import static cn.edu.nun.campus.course.CourseController.CourseReq;

/** Deterministic parsers for spreadsheet rows, merged timetable cells and calendar events. */
@Component
public class CourseImportParser {
    private final ObjectMapper json;
    public CourseImportParser(ObjectMapper json) { this.json=json; }
    public record Parsed(List<CourseReq> courses,List<String> warnings,LocalDate termStart) {}
    public static final String[] STARTS={"08:00","08:55","10:10","11:05","14:00","14:55","16:10","17:05"};
    public static final String[] ENDS={"08:45","09:40","10:55","11:50","14:45","15:40","16:55","17:50"};

    public static String normalizeWeeks(String raw) {
        String s=raw==null?"":raw.trim().replace('，',',').replace('、',',').replace('－','-').replace('—','-').replace('–','-')
                .replace('～','-').replace('~','-').replace('（','(').replace('）',')').replaceAll("\\s+","");
        s=s.replace("每周","").replace("全部周","").replace("全周","").replace("第","").replace("周","")
                .replace("单数","单").replace("双数","双");
        return s;
    }
    public static Set<Integer> weekNumbers(String raw) {
        String s=normalizeWeeks(raw);
        if(s.isEmpty())return Set.of();
        Set<Integer> result=new TreeSet<>();
        for(String part:s.split(",",-1)) {
            Matcher m=Pattern.compile("(?:(\\d{1,2})(?:-(\\d{1,2}))?)?(?:\\(?([单双])\\)?)?").matcher(part);
            if(!m.matches()||part.isEmpty())throw BizException.badRequest("周次格式应为1-16、1-16(单)或1,3,5");
            int a=m.group(1)==null?1:Integer.parseInt(m.group(1));
            int b=m.group(1)==null?60:m.group(2)==null?a:Integer.parseInt(m.group(2));
            if(a<1||b>60||a>b)throw BizException.badRequest("周次范围应在1—60周内");
            for(int i=a;i<=b;i++)if(m.group(3)==null||i%2==("单".equals(m.group(3))?1:0))result.add(i);
        }
        if(result.isEmpty())throw BizException.badRequest("所选单双周范围没有有效周次");
        return result;
    }
    public static void validate(CourseReq r) {
        if(r==null||r.name()==null||r.name().isBlank()||r.name().trim().length()>128)throw BizException.badRequest("请核对课程名称（1—128字）");
        if(r.weekday()==null||r.weekday()<1||r.weekday()>7)throw BizException.badRequest("请核对星期（周一至周日）");
        if(r.startSect()==null||r.endSect()==null||r.startSect()<1||r.endSect()>12||r.startSect()>r.endSect())throw BizException.badRequest("请核对节次（1—12节，起始不大于结束）");
        if(r.teacher()!=null&&r.teacher().length()>64||r.location()!=null&&r.location().length()>128||r.weeks()!=null&&r.weeks().length()>64)throw BizException.badRequest("课程字段过长，请缩短后重试");
        weekNumbers(r.weeks());
    }
    public Parsed checked(List<CourseReq> rows,List<String> warnings,LocalDate start) {
        if(rows.isEmpty())throw BizException.badRequest("未找到可导入课程，请检查文件是否包含课程、星期和节次");
        if(rows.size()>300)throw BizException.badRequest("一次最多导入300条课程");
        List<CourseReq> valid=new ArrayList<>();
        Set<String> keys=new HashSet<>();
        for(int i=0;i<rows.size();i++) {
            try{validate(rows.get(i));}catch(BizException e){throw BizException.badRequest("第"+(i+1)+"条课程："+e.getMessage());}
            CourseReq r=rows.get(i);
            CourseReq n=new CourseReq(r.name().trim(),clean(r.teacher()),clean(r.location()),r.weekday(),r.startSect(),r.endSect(),normalizeWeeks(r.weeks()));
            if(keys.add(n.toString()))valid.add(n);
        }
        if(valid.size()!=rows.size())warnings.add("已合并文件中的重复课程");
        return new Parsed(valid,List.copyOf(warnings),start);
    }
    private static String clean(String s){return s==null?"":s.trim();}
    private static String field(JsonNode n,String...names) {
        for(String name:names)if(n.hasNonNull(name))return n.get(name).asText();return "";
    }
    public Parsed json(JsonNode n) {
        JsonNode list=n.isArray()?n:n.has("courses")?n.get("courses"):n.path("data").path("courses");
        if(!list.isArray())throw BizException.badRequest("课表数据需要courses数组");
        List<CourseReq> result=new ArrayList<>();
        for(JsonNode c:list) {
            result.add(new CourseReq(field(c,"name","courseName","课程名称"),field(c,"teacher","教师"),
                    field(c,"location","classroom","教室"),day(field(c,"weekday","day","星期")),
                    number(field(c,"startSect","startSection","开始节次")),number(field(c,"endSect","endSection","结束节次")),
                    field(c,"weeks","weekText","周次")));
        }
        List<String>warnings=new ArrayList<>();
        if(n.path("warnings").isArray())for(JsonNode w:n.get("warnings"))if(w.isTextual())warnings.add(w.asText());
        LocalDate term=null;
        String date=field(n,"termStart");
        if(!date.isBlank())try{term=LocalDate.parse(date);}catch(Exception ignored){warnings.add("开学日期未识别，请在课表中设置");}
        return checked(result,warnings,term);
    }
    public Parsed parse(String name,byte[] bytes,LocalDate termStart) {
        String ext=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        try {
            return switch(ext) {
                case "xlsx","xls" -> workbook(bytes);
                case "csv","tsv" -> table(csv(decode(bytes),ext.equals("tsv")?'\t':','));
                case "json" -> json(json.readTree(decode(bytes)));
                case "ics" -> calendar(decode(bytes),termStart);
                default -> throw BizException.badRequest("支持Excel、CSV、ICS、JSON和PDF课表文件");
            };
        }catch(BizException e){throw e;}catch(Exception e){throw BizException.badRequest("文件无法读取，请使用未加密的Excel、CSV、ICS、JSON或PDF文件");}
    }
    static String decode(byte[] b) {
        String text=new String(b,StandardCharsets.UTF_8);
        if(text.contains("\uFFFD"))text=new String(b,Charset.forName("GB18030"));
        return text.replace("\uFEFF","");
    }
    static List<List<String>> csv(String text,char delimiter) {
        List<List<String>> rows=new ArrayList<>();List<String> row=new ArrayList<>();StringBuilder cell=new StringBuilder();boolean quoted=false;
        for(int i=0;i<text.length();i++) {
            char c=text.charAt(i);
            if(c=='"'){if(quoted&&i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else quoted=!quoted;}
            else if(c==delimiter&&!quoted){row.add(cell.toString());cell.setLength(0);}
            else if((c=='\n'||c=='\r')&&!quoted){if(c=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;row.add(cell.toString());rows.add(row);row=new ArrayList<>();cell.setLength(0);}
            else cell.append(c);
        }
        if(quoted)throw BizException.badRequest("CSV文件引号未闭合");
        if(!row.isEmpty()||!cell.isEmpty()){row.add(cell.toString());rows.add(row);}return rows;
    }
    private Parsed workbook(byte[] bytes)throws Exception {
        List<CourseReq> rows=new ArrayList<>();List<String>warnings=new ArrayList<>();
        try(Workbook book=WorkbookFactory.create(new ByteArrayInputStream(bytes))){
            if(book.getNumberOfSheets()>30)throw BizException.badRequest("工作表过多，一次最多读取30张");
            DataFormatter formatter=new DataFormatter(Locale.CHINA);
            for(Sheet sheet:book){
                if(sheet.getLastRowNum()>3000)throw BizException.badRequest("Excel行数过多，请只保留课表部分");
                List<List<String>> table=new ArrayList<>();
                for(int r=0;r<=sheet.getLastRowNum();r++){
                    Row row=sheet.getRow(r);
                    if(row==null){table.add(new ArrayList<>());continue;}
                    if(row.getLastCellNum()>100)throw BizException.badRequest("Excel列数过多，请只保留课表部分");
                    List<String> values=new ArrayList<>();
                    for(int i=0;i<Math.max(0,row.getLastCellNum());i++)values.add(formatter.formatCellValue(row.getCell(i)));
                    table.add(values);
                }
                // Keep the upper cell once; attach its merged vertical span as an explicit section range.
                for(CellRangeAddress merge:sheet.getMergedRegions()){
                    if(merge.getFirstRow()==merge.getLastRow()||merge.getFirstColumn()!=merge.getLastColumn())continue;
                    int row=merge.getFirstRow(),col=merge.getFirstColumn();
                    if(row>=table.size()||col>=table.get(row).size())continue;
                    String value=table.get(row).get(col);
                    if(value.isBlank())continue;
                    if(merge.getLastRow()>=table.size())continue;
                    List<Integer>first=rowSections(table.get(row),col);
                    List<Integer>last=rowSections(table.get(merge.getLastRow()),col);
                    if(!first.isEmpty()&&!last.isEmpty()&&first.getFirst()>=1&&last.getLast()<=12)
                        table.get(row).set(col,value+"\n第"+first.getFirst()+"-"+last.getLast()+"节");
                }
                try{var parsed=table(table);rows.addAll(parsed.courses());warnings.addAll(parsed.warnings());}catch(BizException e){
                    if(!e.getMessage().startsWith("未找到"))throw e;
                    warnings.add("工作表“"+sheet.getSheetName()+"”没有识别到结构化课程");
                }
            }
        }
        return checked(rows,warnings,null);
    }
    private static int column(List<String> row,String...names){
        for(int i=0;i<row.size();i++)for(String name:names)if(row.get(i).trim().replace(" ","").equalsIgnoreCase(name))return i;return -1;
    }
    private static String at(List<String>row,int i){return i<0||i>=row.size()?"":row.get(i).trim();}
    public Parsed table(List<List<String>> table) {
        List<CourseReq> rows=new ArrayList<>();
        for(int h=0;h<Math.min(table.size(),30);h++) {
            List<String> header=table.get(h);
            int name=column(header,"课程名称","课程名","课程","name","courseName");
            int day=column(header,"星期","星期几","周几","weekday","day");
            int start=column(header,"开始节次","起始节次","开始节","startSect","startSection");
            int end=column(header,"结束节次","结束节","endSect","endSection");
            int section=column(header,"节次","上课节次","section","sections");
            if(name<0||day<0||start<0&&section<0)continue;
            int teacher=column(header,"教师","任课教师","教师姓名","teacher");
            int place=column(header,"教室","上课地点","地点","location","classroom");
            int weeks=column(header,"周次","上课周次","weeks","weekText");
            for(int i=h+1;i<table.size();i++){
                List<String> r=table.get(i);if(at(r,name).isEmpty())continue;
                List<Integer>numbers=numbers(at(r,section));
                Integer a=start<0?(numbers.isEmpty()?null:numbers.getFirst()):number(at(r,start));
                Integer b=end<0?(numbers.isEmpty()?a:numbers.getLast()):number(at(r,end));
                if(b==null)b=a;
                rows.add(new CourseReq(at(r,name),at(r,teacher),at(r,place),day(at(r,day)),a,b,at(r,weeks)));
            }
            return checked(rows,new ArrayList<>(),null);
        }
        // Common school exports: a weekday header and one cell per course block.
        for(int h=0;h<Math.min(table.size(),30);h++){
            List<String> header=table.get(h);Map<Integer,Integer> days=new LinkedHashMap<>();
            for(int c=0;c<header.size();c++){String s=header.get(c).trim();Matcher dm=Pattern.compile("^(?:星期|周)([一二三四五六日天])(?:\\s.*)?$",Pattern.DOTALL).matcher(s);if(dm.matches())days.put(c,day(dm.group(1)));}
            if(days.size()<5)continue;
            for(int r=h+1;r<table.size();r++)for(var entry:days.entrySet()){
                String cell=at(table.get(r),entry.getKey());if(cell.isBlank())continue;
                List<Integer> sections=rowSections(table.get(r),days.keySet().iterator().next());
                int a=sections.isEmpty()?0:sections.getFirst(),b=sections.isEmpty()?0:sections.getLast();
                Matcher slot=Pattern.compile("(?:第|\\[|【)?(\\d{1,2})\\s*[-~～至]\\s*(\\d{1,2})\\s*节").matcher(cell);
                if(slot.find()){a=Integer.parseInt(slot.group(1));b=Integer.parseInt(slot.group(2));}
                String[] lines=cell.split("[\\r\\n]+");String title=lines[0].trim();
                String teacher="",place="",weeks="";
                for(String line:lines){
                    if(line.matches(".*(?:教师|老师)[:：].*"))teacher=line.replaceFirst(".*?(?:教师|老师)[:：]","").trim();
                    if(line.matches(".*(?:教室|地点)[:：].*"))place=line.replaceFirst(".*?(?:教室|地点)[:：]","").trim();
                    Matcher wm=Pattern.compile("(\\d{1,2}(?:[-~～]\\d{1,2})?(?:[,，、]\\d{1,2}(?:-\\d{1,2})?)*\\s*周(?:[（(]?[单双]周?[）)]?)?)").matcher(line);
                    if(wm.find())weeks=wm.group(1);
                }
                if(title.isBlank()||title.matches("[上下晚]午|晚上"))continue;
                if(a<1||a>12)throw BizException.badRequest("网格课表缺少明确节次，请使用带节次的教务导出表，或改用照片导入");
                rows.add(new CourseReq(title,teacher,place,entry.getValue(),a,b,weeks));
            }
            return checked(rows,new ArrayList<>(List.of("请核对网格课表的教师、教室和合并节次")),null);
        }
        throw BizException.badRequest("未找到结构化课程，文件需包含课程名称、星期、节次列，或完整周课表");
    }
    private static List<Integer> rowSections(List<String>row,int beforeColumn){
        for(int i=0;i<Math.min(beforeColumn,row.size());i++){
            String first=at(row,i).split("\\R",2)[0].trim();
            Matcher m=Pattern.compile("^(?:第)?(\\d{1,2}(?:\\s*[-~～—至,，、]\\s*\\d{1,2})*)\\s*(?:节)?(?:\\s+.*)?$").matcher(first);
            if(m.matches()){
                List<Integer> values=numbers(m.group(1));
                if(values.stream().allMatch(n->n>=1&&n<=12))return values;
            }
        }
        return List.of();
    }
    static Integer number(String value){Matcher m=Pattern.compile("(?:第)?(\\d{1,2})(?:节)?").matcher(value.trim());return m.matches()?Integer.valueOf(m.group(1)):null;}
    static List<Integer> numbers(String s){List<Integer> result=new ArrayList<>();Matcher m=Pattern.compile("\\d+").matcher(s);while(m.find())result.add(Integer.valueOf(m.group()));return result;}
    static Integer day(String s){
        String clean=s.trim().replace("星期","").replace("周","");
        int i="一二三四五六日".indexOf(clean);if(clean.length()==1&&i>=0)return i+1;if(clean.equals("天"))return 7;
        return switch(clean.toUpperCase(Locale.ROOT)){case "MO","MON"->1;case "TU","TUE"->2;case "WE","WED"->3;case "TH","THU"->4;case "FR","FRI"->5;case "SA","SAT"->6;case "SU","SUN"->7;default->number(clean);};
    }
    private Parsed calendar(String text,LocalDate termStart){
        if(termStart==null)throw BizException.badRequest("导入ICS前请先设置本学期开学日期，以便换算周次");
        List<CourseReq> rows=new ArrayList<>();Map<String,String>event=null;
        for(String line:text.replaceAll("\\r?\\n[ \\t]","").split("\\r?\\n")){
            if(line.equals("BEGIN:VEVENT")){event=new LinkedHashMap<>();continue;}
            if(line.equals("END:VEVENT")&&event!=null){calendarEvent(event,termStart,rows);event=null;continue;}
            if(event!=null){int split=line.indexOf(':');if(split>0){String key=line.substring(0,split);if(key.startsWith("DTSTART;")&&!key.contains("TZID=Asia/Shanghai")&&!key.contains("TZID=Asia/Chongqing"))throw BizException.badRequest("ICS时区请使用Asia/Shanghai或UTC");event.put(key.split(";")[0],line.substring(split+1));}}
        }
        return checked(rows,new ArrayList<>(),termStart);
    }
    private void calendarEvent(Map<String,String>e,LocalDate term,List<CourseReq>rows){
        if(!e.containsKey("DTSTART")||!e.containsKey("DTEND"))throw BizException.badRequest("ICS课程缺少起止时间");
        if(e.containsKey("EXDATE")||e.containsKey("RDATE"))throw BizException.badRequest("ICS包含特殊调课日期，请先在日历中展开后导出");
        LocalDateTime start=dateTime(e.get("DTSTART")),end=dateTime(e.get("DTEND"));
        if(!start.toLocalDate().equals(end.toLocalDate()))throw BizException.badRequest("ICS课程不能跨天");
        int a=Arrays.asList(STARTS).indexOf(start.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")))+1;
        int b=Arrays.asList(ENDS).indexOf(end.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")))+1;
        if(a==0||b==0)throw BizException.badRequest("ICS上课时间与当前节次不一致，请按学校第1—8节时间导出");
        Map<String,String>rule=new HashMap<>();for(String kv:e.getOrDefault("RRULE","").split(";")){String[]p=kv.split("=",2);if(p.length==2)rule.put(p[0],p[1]);}
        if(!Set.of("FREQ","INTERVAL","COUNT","UNTIL","BYDAY","WKST").containsAll(rule.keySet()))throw BizException.badRequest("ICS包含特殊重复规则，请先在日历中展开后导出");
        if(!rule.isEmpty()&&!"WEEKLY".equals(rule.get("FREQ")))throw BizException.badRequest("ICS目前支持单次或每周重复课程");
        if(!rule.isEmpty()&&!rule.containsKey("COUNT")&&!rule.containsKey("UNTIL"))throw BizException.badRequest("ICS重复课程请设置结束日期或重复次数，避免周次不准确");
        if(rule.containsKey("BYDAY")&&!rule.get("BYDAY").equals(new String[]{"MO","TU","WE","TH","FR","SA","SU"}[start.getDayOfWeek().getValue()-1]))throw BizException.badRequest("ICS每条事件请只保留一个星期，避免漏导课程");
        int interval=Integer.parseInt(rule.getOrDefault("INTERVAL","1"));if(interval<1||interval>60)throw BizException.badRequest("ICS重复间隔不正确");
        int count=rule.isEmpty()?1:Integer.parseInt(rule.getOrDefault("COUNT","60"));if(count<1||count>300)throw BizException.badRequest("ICS重复次数过多");
        LocalDate until=rule.containsKey("UNTIL")?LocalDate.parse(rule.get("UNTIL").substring(0,8),DateTimeFormatter.BASIC_ISO_DATE):term.plusWeeks(60).minusDays(1);
        List<String>weeks=new ArrayList<>();
        LocalDate monday=term.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        for(int i=0;i<count;i++){LocalDate date=start.toLocalDate().plusWeeks((long)i*interval);if(date.isAfter(until))break;long week=ChronoUnit.WEEKS.between(monday,date.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))+1;if(week>=1&&week<=60)weeks.add(String.valueOf(week));}
        if(weeks.isEmpty())throw BizException.badRequest("ICS课程日期不在当前学期范围内");
        String compact=compactWeeks(weeks);
        rows.add(new CourseReq(unescape(e.getOrDefault("SUMMARY","")),unescape(e.getOrDefault("X-TEACHER","")),unescape(e.getOrDefault("LOCATION","")),start.getDayOfWeek().getValue(),a,b,compact));
    }
    private static String compactWeeks(List<String>weeks){
        if(weeks.size()>1){int a=Integer.parseInt(weeks.getFirst()),b=Integer.parseInt(weeks.getLast());if(b-a+1==weeks.size())return a+"-"+b;if((b-a)/2+1==weeks.size())return a+"-"+b+(a%2==0?"(双)":"(单)");}
        return String.join(",",weeks);
    }
    private static LocalDateTime dateTime(String s){
        if(s.endsWith("Z"))return LocalDateTime.ofInstant(Instant.from(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssX").parse(s)),ZoneId.of("Asia/Shanghai"));
        return LocalDateTime.parse(s,DateTimeFormatter.ofPattern(s.length()==13?"yyyyMMdd'T'HHmm":"yyyyMMdd'T'HHmmss"));
    }
    private static String unescape(String s){return s.replace("\\n"," ").replace("\\N"," ").replace("\\,",",").replace("\\;",";").replace("\\\\","\\");}
}
