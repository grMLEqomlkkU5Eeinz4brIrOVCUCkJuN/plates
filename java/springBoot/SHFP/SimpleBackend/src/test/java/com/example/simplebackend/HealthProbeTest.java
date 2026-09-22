package com.example.simplebackend;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Uses a database of its own because it takes that database away, which would
 * strand every other test sharing the one in PostgresTestBase.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
class HealthProbeTest {

    private static final PostgreSQLContainer DISPOSABLE = new PostgreSQLContainer("postgres:17-alpine");

    static {
        DISPOSABLE.start();
    }

    @LocalManagementPort
    private int managementPort;


    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DISPOSABLE::getJdbcUrl);
        registry.add("spring.datasource.username", DISPOSABLE::getUsername);
        registry.add("spring.datasource.password", DISPOSABLE::getPassword);
    }

    @AfterAll
    static void discard() {
        DISPOSABLE.stop();
    }

    /**
     * A readiness probe that stays green while every query fails is worse than no
     * probe, because it keeps routing traffic to an instance that cannot serve it.
     * Liveness must not follow it down: restarting the process does not bring
     * Postgres back, it only removes the instance that would recover with it.
     */
    @Test
    void readinessFollowsTheDatabaseDownWhileLivenessHoldsTheProcessUp() {
        assertThat(probe("readiness").getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(probe("liveness").getStatusCode()).isEqualTo(HttpStatus.OK);

        DISPOSABLE.stop();

        ResponseEntity<JsonNode> readiness = probe("readiness");
        assertThat(readiness.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(readiness.getBody().get("status").asString()).isEqualTo("DOWN");

        assertThat(probe("liveness").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private ResponseEntity<JsonNode> probe(String name) {
        return new ApiClient(managementPort).get("/actuator/health/" + name);
    }
}
