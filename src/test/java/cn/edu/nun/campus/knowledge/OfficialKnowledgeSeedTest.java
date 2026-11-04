package cn.edu.nun.campus.knowledge;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.postgresql.PGConnection;
import org.postgresql.copy.CopyManager;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OfficialKnowledgeSeedTest {
    @TempDir Path directory;
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Connection connection = mock(Connection.class);
    private final Statement statement = mock(Statement.class);
    private final PGConnection postgres = mock(PGConnection.class);
    private final CopyManager copy = mock(CopyManager.class);

    @BeforeEach void prepare() throws Exception {
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(jdbc.execute(org.mockito.ArgumentMatchers.<ConnectionCallback<Long>>any()))
                .thenAnswer(call -> call.<ConnectionCallback<Long>>getArgument(0).doInConnection(connection));
        when(connection.createStatement()).thenReturn(statement);
        when(connection.unwrap(PGConnection.class)).thenReturn(postgres);
        when(postgres.getCopyAPI()).thenReturn(copy);
    }

    private ResultSet count(long value) throws Exception {
        var result = mock(ResultSet.class);
        when(result.next()).thenReturn(true);
        when(result.getLong(1)).thenReturn(value);
        return result;
    }

    private Path seed() throws Exception {
        Path file = directory.resolve("seed.csv.gz");
        try (var output = new GZIPOutputStream(Files.newOutputStream(file))) {
            output.write("title\n第一篇\n第二篇\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        return file;
    }

    @Test void anExistingSnapshotSkipsTheFileAndPreservesEditedContent() throws Exception {
        var existing = count(2);
        when(statement.executeQuery(OfficialKnowledgeSeed.COUNT)).thenReturn(existing);
        new OfficialKnowledgeSeed(jdbc, manager, directory.resolve("not-present.gz").toString(), 2).afterPropertiesSet();
        verify(manager).commit(any());
        verify(statement, never()).executeUpdate(anyString());
        verifyNoInteractions(copy);
    }

    @Test void restoresInOneTransactionWithALockAndNeverOverwritesExistingRows() throws Exception {
        var before = count(1);
        var after = count(2);
        when(statement.executeQuery(OfficialKnowledgeSeed.COUNT)).thenReturn(before, after);
        when(copy.copyIn(anyString(), any(InputStream.class))).thenAnswer(call -> {
            String decoded = new String(call.<InputStream>getArgument(1).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(decoded.contains("第二篇"));
            return 2L;
        });
        new OfficialKnowledgeSeed(jdbc, manager, seed().toString(), 2).afterPropertiesSet();
        var ordered = inOrder(statement, copy, manager);
        ordered.verify(statement).execute(contains("pg_advisory_xact_lock"));
        ordered.verify(statement).executeQuery(OfficialKnowledgeSeed.COUNT);
        ordered.verify(statement).execute(contains("CREATE TEMP TABLE"));
        ordered.verify(copy).copyIn(contains("FROM STDIN"), any(InputStream.class));
        ordered.verify(statement).executeUpdate(contains("ON CONFLICT (import_key) DO NOTHING"));
        ordered.verify(manager).commit(any());
        verify(manager, never()).rollback(any());
    }

    @Test void aWrongRowCountRollsBackBeforeInsertingAnyArticle() throws Exception {
        var existing = count(0);
        when(statement.executeQuery(OfficialKnowledgeSeed.COUNT)).thenReturn(existing);
        when(copy.copyIn(anyString(), any(InputStream.class))).thenReturn(1L);
        var job = new OfficialKnowledgeSeed(jdbc, manager, seed().toString(), 2);
        assertThrows(IllegalStateException.class, job::afterPropertiesSet);
        verify(statement, never()).executeUpdate(anyString());
        verify(manager).rollback(any());
        verify(manager, never()).commit(any());
    }

    @Test void aDamagedArchiveRollsBackAndCanBeRetriedAfterRepair() throws Exception {
        var existing = count(0);
        when(statement.executeQuery(OfficialKnowledgeSeed.COUNT)).thenReturn(existing);
        Path file = directory.resolve("damaged.gz");
        Files.writeString(file, "not a gzip file");
        var job = new OfficialKnowledgeSeed(jdbc, manager, file.toString(), 2);
        assertThrows(IllegalStateException.class, job::afterPropertiesSet);
        verifyNoInteractions(copy);
        verify(manager).rollback(any());
    }
}
