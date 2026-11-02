package cn.edu.nun.campus.llm;

import java.util.List;

/** 统一模型适配层接口：业务代码只依赖本接口，不绑定具体供应商 */
public interface LlmClient {

    record Message(String role, String content) {
        public static Message system(String c) { return new Message("system", c); }
        public static Message user(String c) { return new Message("user", c); }
        public static Message assistant(String c) { return new Message("assistant", c); }
    }

    record Result(String content, int promptTokens, int outputTokens, String model) {}

    /** 同步对话补全；超时/失败抛 LlmException */
    Result chat(List<Message> messages, String purpose);

    class LlmException extends RuntimeException {
        public LlmException(String msg, Throwable cause) { super(msg, cause); }
        public LlmException(String msg) { super(msg); }
    }
}
