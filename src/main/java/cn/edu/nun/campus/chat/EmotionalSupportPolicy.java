package cn.edu.nun.campus.chat;

import cn.edu.nun.campus.assistant.AssistantSettingsService;

import java.util.regex.Pattern;

/** 明确危险的短路响应不依赖模型或校园知识库，普通情绪仍由对话理解。 */
final class EmotionalSupportPolicy {
    private static final Pattern RISK = Pattern.compile(
            "不想活了|活不下去|不想再活|想死|想自杀|要自杀|准备自杀|打算自杀|" +
            "想结束生命|要结束生命|想伤害自己|要伤害自己|控制不住.{0,8}伤害自己|" +
            "想跳楼|要跳楼|准备跳楼|准备跳下去|正在.{0,4}(自伤|自残|割腕)|" +
            "(已经|刚刚|刚才).{0,6}(吞药|割腕|服药过量)|吃了.{0,6}(很多|一瓶|过量).{0,5}(药|安眠)");
    private static final Pattern NEGATION = Pattern.compile(
            "(并不想|不想|没有想|不会|不准备|不打算)(自杀|跳楼|伤害自己)|没有自杀想法|从没想过自杀|不想死");
    private static final Pattern DISTRESS = Pattern.compile(
            "安慰|心情|情绪|难过|焦虑|崩溃|孤独|委屈|心烦|睡不着|失眠|坚持不住|" +
            "我.{0,15}(压力|累|无助|难受|痛苦|担心|害怕)");

    private EmotionalSupportPolicy() {}

    static boolean immediateRisk(String text) {
        String normalized = text == null ? "" : text.replaceAll("\\s+", "");
        return RISK.matcher(NEGATION.matcher(normalized).replaceAll("")).find();
    }

    static boolean distressed(String text) {
        return DISTRESS.matcher(text == null ? "" : text).find();
    }

    static String crisisReply(AssistantSettingsService.Settings settings) {
        String reply = "谢谢你愿意把这些说出来。现在最重要的是你和身边人的安全。\n"
                + "如果你或身边的人可能马上伤害自己，请先去有人陪伴的安全地方，"
                + "把可能造成伤害的物品交给可信的人保管，并立即联系身边的朋友、家人或老师。\n"
                + "如果已经受伤、服药过量或有迫在眉睫的危险，请立即联系当地急救或警方，"
                + "让身边的人陪同就医。不要独自承受，也不要只依靠线上聊天。";
        if (settings.supportContact() != null && !settings.supportContact().isBlank()
                && settings.supportContactVerifiedAt() != null) {
            reply += "\n校园支持联系方式：" + settings.supportContact()
                    + "（核实日期：" + settings.supportContactVerifiedAt() + "）。";
        }
        return reply + "\n你现在身边有没有一位可以马上联系、陪着你的人？";
    }

    static String fallback(String text, boolean supportEnabled) {
        if (supportEnabled && distressed(text)) {
            return "听起来你现在有些不好受。先不用急着把所有问题都解决，可以慢慢呼吸、喝一点水，"
                    + "或者找一个信任的人陪你坐一会儿。\n我暂时没能生成完整回复，但你刚才说的感受值得被认真对待。"
                    + "如果你愿意，等连接恢复后可以继续告诉我，眼下最让你难受的是哪件事。";
        }
        return "我暂时没能生成回复，请稍后再试。校园搜索、地图和办事指南仍可使用。";
    }
}
