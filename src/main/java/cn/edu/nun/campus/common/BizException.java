package cn.edu.nun.campus.common;

public class BizException extends RuntimeException {
    private final int code;

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }

    public static BizException notFound(String what) {
        return new BizException(404, what + "不存在");
    }

    public static BizException forbidden(String msg) {
        return new BizException(403, msg);
    }

    public static BizException badRequest(String msg) {
        return new BizException(400, msg);
    }
}
