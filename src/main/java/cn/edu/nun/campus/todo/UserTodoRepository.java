package cn.edu.nun.campus.todo;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserTodoRepository extends JpaRepository<UserTodo, Long> {
    List<UserTodo> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<UserTodo> findByIdAndUserId(Long id, Long userId);
}
