package cn.edu.nun.campus.knowledge;

import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;

/**
 * 中文友好检索：PostgreSQL simple 分词器无法切分中文长句，
 * 因此把查询串切成 2-gram 做子串匹配，按命中 gram 数排序。
 * 短查询（≤2 字）直接整串匹配。
 */
@Service
public class KnowledgeSearchService {

    private static final int MAX_GRAMS = 80;
    private static final String PUNCT = "[\\s，,。？?！!、；;：:（）()\\[\\]{}<>《》“”\"'·…—\\-]+";

    private final KnowledgeRepository repo;

    public KnowledgeSearchService(KnowledgeRepository repo) {
        this.repo = repo;
    }

    public List<KnowledgeItem> search(String query, String type, int limit) {
        return search(query, type, null, limit);
    }

    public List<KnowledgeItem> search(String query, String type, String excludeType, int limit) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty()) return List.of();
        q = normalizeOverviewQuery(q);
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        return excludeType == null
                ? repo.search(q, toGrams(q), type, safeLimit)
                : repo.search(q, toGrams(q), type, excludeType, safeLimit);
    }

    // A school name appears in almost every article; resolve explicit overview requests
    // to the actual overview title rather than rewarding long recruitment/news articles.
    static String normalizeOverviewQuery(String query) {
        String compact = query.replaceAll("[\\s。？！?!]", "");
        if (compact.matches("(?:请问|请|我想了解一下|我想了解|了解一下|了解)?(?:北方民族大学|北民大|学校|校园)(?:的)?(?:学校)?(?:简介|概况|基本情况|介绍)")
                || compact.matches("(?:请|帮我)?介绍(?:一下|下)?(?:北方民族大学|北民大|学校)")) {
            return "学校简介";
        }
        return query;
    }

    /** 生成以 \n 分隔的 2-gram 串（去重、去标点） */
    static String toGrams(String q) {
        String cleaned = q.replaceAll(PUNCT, "");
        if (cleaned.isEmpty()) return q;
        if (cleaned.length() <= 2) return cleaned;
        LinkedHashSet<String> grams = new LinkedHashSet<>();
        for (int i = 0; i + 2 <= cleaned.length() && grams.size() < MAX_GRAMS; i++) {
            grams.add(cleaned.substring(i, i + 2));
        }
        return String.join("\n", grams);
    }
}
