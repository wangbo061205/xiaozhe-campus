package cn.edu.nun.campus.knowledge;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.*;

class KnowledgeExcerptTest {
    @Test void keepsTheKeyConditionsAtTheEndOfALongAdmissionsArticle() {
        String content = "学校新闻与概况。".repeat(500)
                + "\n硕士招生报名条件：考生须符合学历要求，报名截止日期以当年招生简章为准。\n"
                + "附件请查看原文。";
        String excerpt = KnowledgeExcerpt.select(content, "硕士招生报名条件");
        assertTrue(excerpt.contains("考生须符合学历要求"));
        assertTrue(excerpt.contains("以当年招生简章为准"));
        assertTrue(content.contains(excerpt)); assertTrue(excerpt.length() <= 1200);
    }

    @Test void favorsDistinctQuestionGramsOverRepeatedBoilerplate() {
        String content = "学校".repeat(900) + "\n" + "无关段落。".repeat(300)
                + "\n硕士招生：报名材料需包含学历证明；报名条件见当年简章。\n" + "结束。".repeat(100);
        String excerpt = KnowledgeExcerpt.select(content, "学校的硕士招生报名条件和材料是什么？");
        assertTrue(excerpt.contains("报名材料需包含学历证明"));
        assertTrue(excerpt.contains("报名条件见当年简章"));
        assertTrue(content.contains(excerpt));
    }

    @Test void keepsShortTextVerbatimIncludingFormattingAndHandlesMissingContent() {
        String content = "# 测试标题\n\n第一段。\n\n- 条件甲\n- 条件乙\n";
        assertEquals(content, KnowledgeExcerpt.select(content, "条件乙"));
        assertEquals("", KnowledgeExcerpt.select(null, "条件"));
        assertEquals("", KnowledgeExcerpt.select("", "条件"));
    }

    @Test void emptyUnknownOrPunctuationOnlyQueriesFallBackToOneLeadingPassage() {
        String content = "甲".repeat(1500) + "乙".repeat(1500);
        for (String query : new String[]{null, "", "  ", "不存在的内容", "！！！"}) {
            assertEquals(content.substring(0, 1200), KnowledgeExcerpt.select(content, query));
        }
    }

    @Test void caseInsensitiveExactMatchesRemainLiteralOriginalText() {
        String content = "无关".repeat(900) + "\nMBA Admission Requirements: source details.\n" + "尾段".repeat(100);
        String excerpt = KnowledgeExcerpt.select(content, "mba admission requirements");
        assertTrue(excerpt.contains("MBA Admission Requirements")); assertTrue(content.contains(excerpt));
    }

    @Test void aSingleCharacterQueryAndUnicodeBoundariesDoNotExceedTheLimit() {
        String content = "😀".repeat(900) + "\n馆：请核实当天开放安排。" + "😀".repeat(900);
        String excerpt = KnowledgeExcerpt.select(content, "馆");
        assertTrue(excerpt.contains("请核实当天开放安排")); assertTrue(excerpt.length() <= 1200);
        assertTrue(content.contains(excerpt));
        assertFalse(Character.isLowSurrogate(excerpt.charAt(0)));
        assertFalse(Character.isHighSurrogate(excerpt.charAt(excerpt.length() - 1)));
    }

    @Test void referencePreservesOriginalSourceMetadataAndNeverSubstitutesTheImportDate() {
        KnowledgeItem item = new KnowledgeItem(); item.setTitle("2020年招生说明");
        item.setContent("以原始年份为准的测试正文。"); item.setSourceName("研究生院");
        item.setSourceUrl("https://yjsc.nmu.edu.cn/info/1/2.htm"); item.setSourceCategory("硕士招生");
        item.setPublishedAt(OffsetDateTime.parse("2020-03-04T00:00:00+08:00"));
        item.setImportedAt(OffsetDateTime.parse("2026-10-30T19:00:00+08:00"));
        String ref = KnowledgeExcerpt.reference(item, "招生");
        assertTrue(ref.contains("2020-03-04T00:00+08:00"));
        assertTrue(ref.contains(item.getSourceUrl())); assertTrue(ref.contains("栏目：硕士招生"));
        assertFalse(ref.contains("2026-10-30"));
        item.setPublishedAt(null);
        String unknown = KnowledgeExcerpt.reference(item, "招生");
        assertTrue(unknown.contains("原始发布日期：未知"));
        assertFalse(unknown.contains("2026-10-30"));
    }
}
