package cn.edu.nun.campus.knowledge;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeSearchTest {
    @Test void explicitOverviewQuestionsResolveToTheActualOverviewTitle() {
        var repository = mock(KnowledgeRepository.class);
        var search = new KnowledgeSearchService(repository);
        when(repository.search(anyString(),anyString(),isNull(),eq(3))).thenReturn(List.of());
        for (String question : List.of("北方民族大学简介", "校园概况", "介绍一下北方民族大学", "请问北民大的基本情况？")) {
            search.search(question,null,3);
        }
        verify(repository,times(4)).search(eq("学校简介"),anyString(),isNull(),eq(3));
    }

    @Test void admissionsAndDepartmentQuestionsKeepTheirActualSearchTerms() {
        for (String question : List.of("招生简章", "转专业", "校历", "铸牢中华民族共同体", "北方民族大学计算机学院简介", "北方民族大学招聘公告")) {
            assertEquals(question,KnowledgeSearchService.normalizeOverviewQuery(question));
        }
    }
}
