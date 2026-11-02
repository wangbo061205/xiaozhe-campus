package cn.edu.nun.campus.knowledge;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface KnowledgeRepository extends JpaRepository<KnowledgeItem, Long>, JpaSpecificationExecutor<KnowledgeItem> {

    @Query("select k from KnowledgeItem k where k.status = 'PUBLISHED' and (:type is null or k.type = :type) "
            + "and (k.expiresAt is null or k.expiresAt > CURRENT_TIMESTAMP) "
            + "order by coalesce(k.publishedAt, k.createdAt) desc, k.id desc")
    List<KnowledgeItem> latestPublished(@Param("type") KnowledgeItem.Type type, Pageable pageable);

    List<KnowledgeItem> findByStatusOrderByIdDesc(KnowledgeItem.Status status, Pageable pageable);

    List<KnowledgeItem> findByStatusAndTypeOrderByIdDesc(KnowledgeItem.Status status,
                                                         KnowledgeItem.Type type, Pageable pageable);

    /**
     * 中文友好检索（仅返回已发布内容）：
     * 1) 标题整串命中优先；
     * 2) 按 2-gram 命中数量排序（长句问题也能命中短文档）；
     * 3) 再用全文检索 rank 与发布时间兜底排序。
     */
    @Query(value = """
            SELECT k.* FROM knowledge_item k
            WHERE k.status = 'PUBLISHED'
              AND (k.expires_at IS NULL OR k.expires_at > CURRENT_TIMESTAMP)
              AND (:type IS NULL OR k.type = :type)
              AND (:excludeType IS NULL OR k.type <> :excludeType)
              AND EXISTS (
                  SELECT 1 FROM unnest(string_to_array(:grams, E'\\n')) g
                  WHERE g <> ''
                    AND (k.title ILIKE '%' || g || '%'
                         OR coalesce(k.summary,'') ILIKE '%' || g || '%'
                         OR k.content ILIKE '%' || g || '%')
              )
            ORDER BY
              CASE WHEN k.title ILIKE '%' || :q || '%' THEN 1 ELSE 0 END DESC,
              (SELECT count(*) FROM unnest(string_to_array(:grams, E'\\n')) g
                WHERE g <> ''
                  AND (k.title ILIKE '%' || g || '%'
                       OR coalesce(k.summary,'') ILIKE '%' || g || '%'
                       OR k.content ILIKE '%' || g || '%')) DESC,
              ts_rank(coalesce(k.search_tsv, ''::tsvector), plainto_tsquery('simple', :q)) DESC,
              k.published_at DESC NULLS LAST
            LIMIT :limit
            """, nativeQuery = true)
    List<KnowledgeItem> search(@Param("q") String q,
                               @Param("grams") String grams,
                               @Param("type") String type,
                               @Param("excludeType") String excludeType,
                               @Param("limit") int limit);

    default List<KnowledgeItem> search(String q, String grams, String type, int limit) {
        return search(q, grams, type, null, limit);
    }
}
