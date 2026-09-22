package com.example.simplebackend;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Tests run against the database the service actually targets, so the migration,
 * the unique constraints and the optimistic locking UPDATE are the real ones.
 * The container is started once per JVM rather than per class: the alternative is
 * a fresh Postgres for each of these classes.
 */
public abstract class PostgresTestBase {

    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    static {
        POSTGRES.start();
    }

    @Autowired
    private JdbcTemplate jdbc;

    @LocalServerPort
    private int port;

    private ApiClient api;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // A fixed port would collide across the contexts these tests build.
        registry.add("management.server.port", () -> 0);
    }

    @BeforeEach
    void emptyTheTable() {
        jdbc.execute("TRUNCATE TABLE users RESTART IDENTITY");
        api = new ApiClient(port);
    }

    protected ApiClient api() {
        return api;
    }
}
