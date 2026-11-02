package cn.edu.nun.campus.knowledge;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;

/** Selects one unchanged, contiguous passage rather than silently discarding a long article's ending. */
public final class KnowledgeExcerpt {
    public static final int MAX_CHARS = 1200;
    private static final int MAX_QUERY_GRAMS = 128;
    private static final String PUNCTUATION = "[\\s\\p{P}\\p{S}]+";

    private KnowledgeExcerpt() {}

    public static String select(String content, String query) {
        if (content == null) return "";
        if (content.length() <= MAX_CHARS) return content;
        String phrase = query == null ? "" : query.trim();
        if (phrase.isEmpty()) return passage(content, 0);
        String foldedContent = foldAscii(content);
        String foldedPhrase = foldAscii(phrase);
        // A short exact phrase already contains all its grams. Keep context around its first match.
        if (phrase.length() <= 120) {
            int exact = foldedContent.indexOf(foldedPhrase);
            if (exact >= 0) {
                return passage(content, Math.min(content.length() - MAX_CHARS,
                        Math.max(0, exact - (MAX_CHARS - phrase.length()) / 2)));
            }
        }
        String cleaned = foldedPhrase.replaceAll(PUNCTUATION, "");
        LinkedHashSet<String> grams = new LinkedHashSet<>();
        if (cleaned.length() == 1) {
            int match = foldedContent.indexOf(cleaned);
            return passage(content, match < 0 ? 0 : Math.max(0,
                    Math.min(content.length() - MAX_CHARS, match - MAX_CHARS / 2)));
        }
        for (int i = 0; i + 1 < cleaned.length() && grams.size() < MAX_QUERY_GRAMS; i++) {
            grams.add(cleaned.substring(i, i + 2));
        }
        if (grams.isEmpty()) return passage(content, 0);
        Map<String, Integer> ids = new HashMap<>();
        for (String gram : grams) ids.put(gram, ids.size());
        int[] occurrences = new int[grams.size()];
        int coverage = 0;
        for (int i = 0; i < MAX_CHARS - 1; i++) {
            Integer gram = ids.get(foldedContent.substring(i, i + 2));
            if (gram != null && occurrences[gram]++ == 0) coverage++;
        }
        int bestStart = 0;
        int bestCoverage = coverage;
        // Counts track distinct query grams, so repeated boilerplate cannot outweigh more useful terms.
        for (int start = 1; start + MAX_CHARS <= content.length(); start++) {
            Integer removed = ids.get(foldedContent.substring(start - 1, start + 1));
            if (removed != null && --occurrences[removed] == 0) coverage--;
            int endGram = start + MAX_CHARS - 2;
            Integer added = ids.get(foldedContent.substring(endGram, endGram + 2));
            if (added != null && occurrences[added]++ == 0) coverage++;
            if (coverage > bestCoverage) {
                bestCoverage = coverage;
                bestStart = start;
            }
        }
        if (bestCoverage == 0) return passage(content, 0);
        int firstMatch = -1;
        int lastMatch = -1;
        for (int i = bestStart; i + 1 < bestStart + MAX_CHARS; i++) {
            if (ids.containsKey(foldedContent.substring(i, i + 2))) {
                if (firstMatch < 0) firstMatch = i;
                lastMatch = i + 2;
            }
        }
        // Centre the covered terms so an earliest equal-scoring window does not cut off their explanation.
        int centered = Math.max(0, Math.min(content.length() - MAX_CHARS,
                (firstMatch + lastMatch - MAX_CHARS) / 2));
        return passage(content, centered);
    }

    public static String reference(KnowledgeItem item, String query) {
        String published = item.getPublishedAt() == null
                ? "未知（未提供，不以导入日期代替）" : item.getPublishedAt().toString();
        return value(item.getTitle()) + "\n来源：" + value(item.getSourceName())
                + "\n来源链接：" + value(item.getSourceUrl())
                + "\n原始发布日期：" + published
                + "\n栏目：" + value(item.getSourceCategory())
                + "\n正文连续片段：\n" + select(item.getContent(), query) + "\n";
    }

    private static String value(String text) { return text == null || text.isBlank() ? "未标注" : text; }

    private static String passage(String content, int start) {
        int end = Math.min(content.length(), start + MAX_CHARS);
        // Keep the result a literal substring while avoiding half of a UTF-16 surrogate pair.
        if (start > 0 && Character.isLowSurrogate(content.charAt(start))
                && Character.isHighSurrogate(content.charAt(start - 1))) start++;
        if (end < content.length() && Character.isHighSurrogate(content.charAt(end - 1))
                && Character.isLowSurrogate(content.charAt(end))) end--;
        return content.substring(start, end);
    }

    private static String foldAscii(String text) {
        StringBuilder folded = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            folded.append(c >= 'A' && c <= 'Z' ? (char) (c + ('a' - 'A')) : c);
        }
        return folded.toString();
    }
}
