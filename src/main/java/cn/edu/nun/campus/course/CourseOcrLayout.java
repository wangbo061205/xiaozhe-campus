package cn.edu.nun.campus.course;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/** Use dated column anchors to keep the time axis from shifting weekdays in OCR. */
final class CourseOcrLayout {
    private record Anchor(int weekday,double center,double y,double height){}
    static JsonNode compactResult(JsonNode source){
        JsonNode annotated=annotate(source);
        ObjectNode result=JsonNodeFactory.instance.objectNode();
        result.put("width",annotated.path("width").asInt()).put("height",annotated.path("height").asInt());
        result.put("format","textRows每行依次为[weekday,x,y,width,height,text]。weekday为1至7表示已确认的星期，0表示未确定或左侧节次轴，不能把0当周一。位置单位为像素。");
        if(annotated.has("columns"))result.set("columns",annotated.get("columns"));
        if(annotated.has("detectedDate"))result.set("detectedDate",annotated.get("detectedDate"));
        var rows=result.putArray("textRows");
        for(JsonNode line:annotated.path("lines")){
            String text=line.path("text").asText().replaceAll("\\s+"," ").trim()
                .replaceAll("(?<=[\\p{IsHan}\\d]) (?=[\\p{IsHan}\\d])","")
                .replace('：',':').replaceAll("\\s*([:/@（）()，,])\\s*","$1");
            rows.addArray().add(line.path("weekday").asInt()).add(line.path("x").asInt()).add(line.path("y").asInt())
                .add(line.path("width").asInt()).add(line.path("height").asInt()).add(text);
        }
        return result;
    }
    static JsonNode annotate(JsonNode source){
        ObjectNode root=(ObjectNode)source.deepCopy();
        List<JsonNode>lines=new ArrayList<>();root.path("lines").forEach(lines::add);
        LocalDate full=null;
        for(JsonNode line:lines){
            String text=compact(line.path("text").asText());
            var m=Pattern.compile("(20\\d{2})[/-](\\d{1,2})[/-](\\d{1,2})").matcher(text);
            if(m.find())try{full=LocalDate.of(Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),Integer.parseInt(m.group(3)));break;}catch(Exception ignored){}
        }
        if(full==null)return root;
        List<Anchor>dates=new ArrayList<>();
        for(JsonNode line:lines){
            var m=Pattern.compile("(\\d{1,2})[/-](\\d{1,2})").matcher(compact(line.path("text").asText()));
            if(!m.matches()||line.path("y").asDouble()>root.path("height").asDouble()*.45)continue;
            try{
                int month=Integer.parseInt(m.group(1));int year=full.getYear();
                if(month-full.getMonthValue()>6)year--;else if(full.getMonthValue()-month>6)year++;
                int day=LocalDate.of(year,month,Integer.parseInt(m.group(2))).getDayOfWeek().getValue();
                dates.add(new Anchor(day,line.path("x").asDouble()+line.path("width").asDouble()/2,line.path("y").asDouble(),line.path("height").asDouble()));
            }catch(Exception ignored){}
        }
        List<Anchor>row=List.of();
        for(Anchor candidate:dates){
            List<Anchor>group=dates.stream().filter(a->Math.abs(a.y-candidate.y)<=Math.max(12,candidate.height*.5)).sorted(Comparator.comparingDouble(Anchor::center)).toList();
            if(group.size()>row.size())row=group;
        }
        if(row.size()<4)return root;
        List<Double>pitches=new ArrayList<>();
        for(int i=1;i<row.size();i++){
            int delta=row.get(i).weekday-row.get(i-1).weekday;
            if(delta<1)return root;
            pitches.add((row.get(i).center-row.get(i-1).center)/delta);
        }
        Collections.sort(pitches);double pitch=pitches.get(pitches.size()/2);
        if(pitch<=0||pitches.stream().anyMatch(v->Math.abs(v-pitch)>pitch*.15))return root;
        double monday=row.stream().mapToDouble(a->a.center-(a.weekday-1)*pitch).average().orElse(0);
        if(monday-pitch/2<0||monday+6.5*pitch>root.path("width").asDouble()+pitch*.2)return root;
        double below=row.stream().mapToDouble(a->a.y+a.height).max().orElse(0);
        var columns=root.putArray("columns");
        for(int i=0;i<7;i++)columns.addObject().put("weekday",i+1).put("centerX",Math.round(monday+i*pitch)).put("left",Math.round(monday+(i-.5)*pitch)).put("right",Math.round(monday+(i+.5)*pitch));
        root.put("detectedDate",full.toString());
        root.put("layoutExplanation","columns仅包括周一至周日七列。更左侧为节次时间轴，绝不能当作周一。文字行的weekday已按日期与横坐标计算，请严格按此分列。");
        for(JsonNode line:lines){
            double x=line.path("x").asDouble()+line.path("width").asDouble()/2;
            int day=(int)Math.floor((x-monday+pitch/2)/pitch)+1;
            if(day>=1&&day<=7&&line.path("y").asDouble()>below&&line.path("width").asDouble()<=pitch*1.25)
                ((ObjectNode)line).put("weekday",day);
        }
        return root;
    }
    private static String compact(String text){return text.replaceAll("\\s+","").replace('／','/').replace('：',':');}
}
