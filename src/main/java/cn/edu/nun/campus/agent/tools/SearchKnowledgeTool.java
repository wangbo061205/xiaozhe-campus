package cn.edu.nun.campus.agent.tools;

import cn.edu.nun.campus.agent.AgentTask;
import cn.edu.nun.campus.agent.Tool;
import cn.edu.nun.campus.knowledge.KnowledgeSearchService;
import org.springframework.stereotype.Component;

import java.util.Map;

/** 低风险：检索校园知识库 */
@Component
public class SearchKnowledgeTool implements Tool {

    private final KnowledgeSearchService searchService;

    public SearchKnowledgeTool(KnowledgeSearchService searchService) {
        this.searchService = searchService;
    }

    @Override public String name() { return "search_knowledge"; }
    @Override public AgentTask.RiskLevel riskLevel() { return AgentTask.RiskLevel.LOW; }
    @Override public String description() { return "搜索校内通知、政策、办事指南等知识库内容"; }

    @Override
    public Object execute(Long userId, Map<String, Object> params) {
        String q = String.valueOf(params.getOrDefault("q", "")).trim();
        if (q.isEmpty()) throw new IllegalArgumentException("缺少参数 q");
        return searchService.search(q, null, 10);
    }
}
