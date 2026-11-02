package cn.edu.nun.campus.chat;

/** 仅处理发往模型的副本，不改变用户本地输入和会话显示。 */
final class ChatPrivacy {
    private ChatPrivacy() {}

    static String redact(String text) {
        if (text == null) return "";
        return text
                .replaceAll("(?i)(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}(?![a-z0-9])", "[邮箱已隐藏]")
                .replaceAll("(?<!\\d)\\d{17}[\\dXx](?!\\d)", "[证件号码已隐藏]")
                .replaceAll("(?<!\\d)1[3-9]\\d{9}(?!\\d)", "[手机号已隐藏]")
                .replaceAll("(?<!\\d)\\d{16,19}(?!\\d)", "[长号码已隐藏]");
    }
}
