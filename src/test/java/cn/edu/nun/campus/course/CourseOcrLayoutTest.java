package cn.edu.nun.campus.course;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CourseOcrLayoutTest {
    @Test void dateAnchorsKeepTheTimeAxisOutsideTheSevenWeekdays()throws Exception{
        var json=new ObjectMapper();var source=json.createObjectNode().put("width",1260).put("height",2800);var lines=source.putArray("lines");
        lines.addObject().put("text","2026 / 1 0 / 31").put("y",196);
        for(int i=0;i<6;i++)lines.addObject().put("text","1 0 / "+(26+i)).put("x",134+165*i).put("y",440).put("width",95).put("height",30);
        lines.addObject().put("text","08:00").put("x",7).put("y",625).put("width",86);
        lines.addObject().put("text","周一的课程").put("x",118).put("y",1121).put("width",124);
        lines.addObject().put("text","周日的课程").put("x",1110).put("y",1121).put("width",124);
        var result=CourseOcrLayout.annotate(source);
        assertEquals(7,result.path("columns").size());assertEquals("2026-10-31",result.path("detectedDate").asText());
        assertFalse(result.path("lines").path(7).has("weekday"));
        assertEquals(1,result.path("lines").path(8).path("weekday").asInt());
        assertEquals(7,result.path("lines").path(9).path("weekday").asInt());
        assertFalse(source.has("columns"),"不要改变原始OCR记录");
        var compact=CourseOcrLayout.compactResult(source);
        assertEquals(1,compact.path("textRows").path(8).path(0).asInt());
        assertEquals("周一的课程",compact.path("textRows").path(8).path(5).asText());
        assertTrue(compact.toString().length()<result.toString().length(),"精简重复字段，保留坐标和星期");
    }
    @Test void unknownYearNeverInventsWeekdayAnchors()throws Exception{
        var data=new ObjectMapper().readTree("{\"width\":1000,\"height\":2000,\"lines\":[{\"text\":\"10/26\",\"x\":100,\"y\":200}]}");
        assertFalse(CourseOcrLayout.annotate(data).has("columns"));
    }
}
