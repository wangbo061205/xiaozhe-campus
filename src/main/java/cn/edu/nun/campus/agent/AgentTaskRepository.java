package cn.edu.nun.campus.agent;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentTaskRepository extends JpaRepository<AgentTask, Long> {
    List<AgentTask> findByUserIdOrderByUpdatedAtDesc(Long userId);
}
