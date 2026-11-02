package cn.edu.nun.campus.xiaobei;

public class XiaobeiException extends RuntimeException {
    private final int status;
    private final String code;
    private final String requestId;

    public XiaobeiException(int status, String code, String message, String requestId) {
        super(message);
        this.status = status;
        this.code = code;
        this.requestId = requestId;
    }

    public int status() { return status; }
    public String code() { return code; }
    public String requestId() { return requestId; }
}
