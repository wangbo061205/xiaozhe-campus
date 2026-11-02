package cn.edu.nun.campus.chat;

import cn.edu.nun.campus.llm.LlmClient;
import cn.edu.nun.campus.common.BizException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 聊天会话存储（MVP：内存版，重启即失；后续可迁移到 Redis/数据库）。
 * 每个会话保留最近 20 条消息，最多 500 个活跃会话（LRU 淘汰）。
 */
@Component
public class ChatSessionStore {

    private static final int MAX_SESSIONS = 500;
    private static final int MAX_MESSAGES_PER_SESSION = 20;

    private record OwnedSession(Long userId, Deque<LlmClient.Message> messages) {}

    private final Map<String, OwnedSession> sessions = Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, OwnedSession> eldest) {
                    return size() > MAX_SESSIONS;
                }
            });

    public void append(Long userId, String sessionId, LlmClient.Message message) {
        synchronized (sessions) {
            requireUser(userId);
            OwnedSession session = sessions.get(sessionId);
            if (session == null) {
                session = new OwnedSession(userId, new ArrayDeque<>());
                sessions.put(sessionId, session);
            }
            requireOwner(userId, session);
            Deque<LlmClient.Message> q = session.messages();
            q.addLast(message);
            while (q.size() > MAX_MESSAGES_PER_SESSION) {
                q.removeFirst();
            }
        }
    }

    public List<LlmClient.Message> history(Long userId, String sessionId) {
        synchronized (sessions) {
            requireUser(userId);
            OwnedSession session = sessions.get(sessionId);
            if (session == null) return List.of();
            requireOwner(userId, session);
            return new ArrayList<>(session.messages());
        }
    }

    private void requireUser(Long userId) {
        if (userId == null) throw new BizException(401, "请先建立有效会话");
    }

    private void requireOwner(Long userId, OwnedSession session) {
        if (!session.userId().equals(userId)) {
            throw new AccessDeniedException("无权访问这段对话");
        }
    }

    public void clear(Long userId, String sessionId) {
        synchronized (sessions) {
            requireUser(userId);
            OwnedSession session = sessions.get(sessionId);
            if (session != null) {
                requireOwner(userId, session);
                sessions.remove(sessionId);
            }
        }
    }
}
