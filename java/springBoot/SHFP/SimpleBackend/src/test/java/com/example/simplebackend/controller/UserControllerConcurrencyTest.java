package com.example.simplebackend.controller;

import com.example.simplebackend.PostgresTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "api.rate-limit.enabled=false")
class UserControllerConcurrencyTest extends PostgresTestBase {

    private static final int WRITERS = 8;

    /**
     * Every writer reads version 0 and then writes. Without the version column the
     * last write would win silently and the other seven callers would be told their
     * change had been applied.
     */
    @Test
    void onlyOneOfEightSimultaneousUpdatesToOneUserIsAccepted() throws Exception {
        create();
        CyclicBarrier allReady = new CyclicBarrier(WRITERS);

        List<Integer> statuses;
        try (ExecutorService writers = Executors.newFixedThreadPool(WRITERS)) {
            List<Callable<Integer>> attempts = IntStream.range(0, WRITERS)
                    .<Callable<Integer>>mapToObj(n -> () -> {
                        allReady.await();
                        return update(n).getStatusCode().value();
                    })
                    .toList();
            statuses = writers.invokeAll(attempts).stream().map(UserControllerConcurrencyTest::result).toList();
        }

        // If-Match "0" can only ever be satisfied once, so exactly one writer is
        // accepted. A loser that raced the winner to the flush is told 409; one
        // that read the row after the winner committed is told 412 by the
        // precondition. Neither is allowed to overwrite the winner.
        assertThat(statuses).filteredOn(status -> status == 200).hasSize(1);
        assertThat(statuses).filteredOn(status -> status != 200).hasSize(WRITERS - 1)
                .allMatch(status -> status == 409 || status == 412);

        ResponseEntity<JsonNode> after = api().get("/api/v1/users/1");
        assertThat(after.getBody().get("version").asInt()).isEqualTo(1);
        assertThat(after.getBody().get("name").asString()).startsWith("Writer ");
    }

    /**
     * The unique constraint, not a prior existence check, is what makes this safe:
     * two requests that both find the username free still cannot both insert it.
     */
    @Test
    void onlyOneOfEightSimultaneousCreatesOfOneUsernameSucceeds() throws Exception {
        CyclicBarrier allReady = new CyclicBarrier(WRITERS);

        List<Integer> statuses;
        try (ExecutorService writers = Executors.newFixedThreadPool(WRITERS)) {
            List<Callable<Integer>> attempts = IntStream.range(0, WRITERS)
                    .<Callable<Integer>>mapToObj(n -> () -> {
                        allReady.await();
                        return api().post("/api/v1/users", """
                                {"username":"contested","name":"Racer %d","email":"racer%d@example.com"}"""
                                .formatted(n, n)).getStatusCode().value();
                    })
                    .toList();
            statuses = writers.invokeAll(attempts).stream().map(UserControllerConcurrencyTest::result).toList();
        }

        assertThat(statuses).filteredOn(status -> status == 201).hasSize(1);
        assertThat(statuses).filteredOn(status -> status == 409).hasSize(WRITERS - 1);
    }

    private void create() {
        ResponseEntity<JsonNode> created = api().post("/api/v1/users", """
                {"username":"contested","name":"Original","email":"original@example.com"}""");
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    private ResponseEntity<JsonNode> update(int writer) {
        return api().put("/api/v1/users/1", """
                {"name":"Writer %d","email":"writer%d@example.com"}""".formatted(writer, writer), "\"0\"");
    }

    private static int result(Future<Integer> attempt) {
        try {
            return attempt.get();
        } catch (Exception failed) {
            throw new IllegalStateException("a writer did not finish", failed);
        }
    }
}
