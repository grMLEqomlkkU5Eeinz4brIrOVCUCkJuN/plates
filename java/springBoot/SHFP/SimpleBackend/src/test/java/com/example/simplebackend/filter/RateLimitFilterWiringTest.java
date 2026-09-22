package com.example.simplebackend.filter;

import com.example.simplebackend.PostgresTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "api.rate-limit.enabled=true",
        "api.rate-limit.permits-per-minute=60",
        "api.rate-limit.burst-capacity=3"})
class RateLimitFilterWiringTest extends PostgresTestBase {

    @Test
    void refusesTheFourthCallInABurstOfThree() {
        for (int call = 1; call <= 3; call++) {
            assertThat(api().get("/api/v1/users?limit=1").getStatusCode())
                    .isEqualTo(HttpStatus.OK);
        }

        ResponseEntity<JsonNode> refused = api().get("/api/v1/users?limit=1");

        assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(refused.getBody().get("code").asString()).isEqualTo("RATE_LIMITED");
        assertThat(refused.getHeaders().getFirst("Retry-After")).isEqualTo("1");
        // A refused request still carries the id the caller needs to report it.
        assertThat(refused.getHeaders().getFirst(RequestIdFilter.HEADER)).isNotBlank();
    }
}
