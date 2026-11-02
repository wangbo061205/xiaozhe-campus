package cn.edu.nun.campus.course;

import cn.edu.nun.campus.common.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class CourseImportParserTest {
    final CourseImportParser parser=new CourseImportParser(new ObjectMapper());
    @Test void csvHandlesQuotedNamesAndOddWeeks(){
        String csv="课程名称,星期,节次,教师,教室,周次\r\n\"数学,软件\",周五,3-4,董老师,03D306,1-16(单)\r\n";
        var data=parser.parse("course.csv",csv.getBytes(StandardCharsets.UTF_8),null);
        assertEquals(1,data.courses().size());var c=data.courses().getFirst();
        assertEquals("数学,软件",c.name());assertEquals(5,c.weekday());assertEquals(3,c.startSect());assertEquals(4,c.endSect());
        assertTrue(CourseImportParser.weekNumbers(c.weeks()).contains(9));assertFalse(CourseImportParser.weekNumbers(c.weeks()).contains(10));
    }
    @Test void mergedExcelRetainsTheWholeCourseSpan()throws Exception{
        byte[]bytes;
        try(var book=new XSSFWorkbook();var out=new ByteArrayOutputStream()){
            var sheet=book.createSheet("学期课表");var header=sheet.createRow(0);header.createCell(0).setCellValue("节次");
            String[]days={"周一","周二","周三","周四","周五","周六","周日"};
            for(int i=0;i<7;i++)header.createCell(i+1).setCellValue(days[i]+"\n10/"+(26+i));
            for(int i=1;i<=8;i++)sheet.createRow(i).createCell(0).setCellValue("第"+i+"节\n"+CourseImportParser.STARTS[i-1]+"\n"+CourseImportParser.ENDS[i-1]);
            sheet.getRow(3).createCell(2).setCellValue("大学日语\n教师：冠老师\n教室：150317\n1-16周");
            sheet.addMergedRegion(new CellRangeAddress(3,4,2,2));book.write(out);bytes=out.toByteArray();
        }
        var data=parser.parse("教务.xlsx",bytes,null);var c=data.courses().getFirst();
        assertEquals(2,c.weekday());assertEquals(3,c.startSect());assertEquals(4,c.endSect());assertEquals("150317",c.location());
    }
    @Test void calendarUsesRealSemesterWeeksAndSchoolTimes(){
        String ics="BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:大学物理II\r\nDTSTART;TZID=Asia/Shanghai:20261027T080000\r\nDTEND;TZID=Asia/Shanghai:20261027T094000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3\r\nLOCATION:160212\r\nEND:VEVENT\r\nEND:VCALENDAR";
        var data=parser.parse("课程.ics",ics.getBytes(StandardCharsets.UTF_8),LocalDate.of(2026,8,31));
        var c=data.courses().getFirst();assertEquals(2,c.weekday());assertEquals(1,c.startSect());assertEquals(2,c.endSect());
        assertEquals("9-13(单)",c.weeks());
        assertThrows(BizException.class,()->parser.parse("课程.ics",ics.getBytes(StandardCharsets.UTF_8),null));
    }
    @Test void invalidRowsAreRejectedRatherThanPartlyImported()throws Exception{
        assertThrows(BizException.class,()->parser.parse("course.json","{\"courses\":[{\"name\":\"错误\",\"weekday\":8,\"startSect\":1,\"endSect\":2}]}".getBytes(StandardCharsets.UTF_8),null));
        assertThrows(BizException.class,()->CourseImportParser.weekNumbers("16-1"));
        assertThrows(BizException.class,()->CourseImportParser.weekNumbers("0-16"));
        assertThrows(BizException.class,()->CourseImportParser.weekNumbers("1,随便"));
        assertThrows(BizException.class,()->parser.parse("course.json","{\"courses\":[{\"name\":\"错误星期\",\"weekday\":1.5,\"startSect\":1,\"endSect\":2}]}".getBytes(StandardCharsets.UTF_8),null));
    }
    @Test void educationFieldsMapWithoutLosingWeekText()throws Exception{
        var result=parser.json(new ObjectMapper().readTree("{\"courses\":[{\"courseName\":\"数据结构\",\"teacher\":\"纪老师\",\"classroom\":\"310110\",\"weekday\":4,\"startSection\":5,\"endSection\":6,\"weekText\":\"第1-16周(双)\"}]}"));
        assertEquals("1-16(双)",result.courses().getFirst().weeks());
    }
}
