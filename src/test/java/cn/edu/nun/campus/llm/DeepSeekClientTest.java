package cn.edu.nun.campus.llm;

import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeepSeekClientTest {
    @Test void sendsKnownUtf8LengthAndParsesCourseRecognitionReply()throws Exception{
        var requests=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/chat/completions",exchange->{
            byte[] bytes=exchange.getRequestBody().readAllBytes();
            assertEquals(String.valueOf(bytes.length),exchange.getRequestHeaders().getFirst("Content-Length"));
            assertNull(exchange.getRequestHeaders().getFirst("Transfer-Encoding"));
            assertEquals("Bearer test-server-key",exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("大学物理课表",new ObjectMapper().readTree(bytes).path("messages").path(0).path("content").asText());
            requests.incrementAndGet();
            byte[] reply="{\"choices\":[{\"message\":{\"content\":\"识别完成\"}}],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":3}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,reply.length);
            try(var out=exchange.getResponseBody()){out.write(reply);}
        });
        server.start();
        try{
            var usage=mock(LlmUsageRecorder.class);
            var client=new DeepSeekClient("http://127.0.0.1:"+server.getAddress().getPort(),"test-server-key","test-model",5,2,usage);
            var result=client.chat(List.of(LlmClient.Message.user("大学物理课表")),"course-import");
            assertEquals("识别完成",result.content());assertEquals(8,result.promptTokens());assertEquals(1,requests.get());
            verify(usage).record(eq("test-model"),eq(result),anyInt(),eq(true),eq("course-import"));
        }finally{server.stop(0);}
    }
}
