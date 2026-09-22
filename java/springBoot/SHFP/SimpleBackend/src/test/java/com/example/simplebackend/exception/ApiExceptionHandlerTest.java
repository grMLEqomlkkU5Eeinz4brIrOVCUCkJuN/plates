package com.example.simplebackend.exception;

import com.example.simplebackend.PostgresTestBase;
import com.example.simplebackend.filter.RequestIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every failure leaves through one envelope. These assert the shape callers parse
 * and, for the unexpected case, that nothing about the server goes with it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "api.rate-limit.enabled=false")
class ApiExceptionHandlerTest extends PostgresTestBase {

    private static final String SECRET_IN_THE_MESSAGE = "jdbc:postgresql://secret-host/ledger";

    @TestConfiguration
    static class ThrowingEndpoint {

        @RestController
        static class Boom {

            @GetMapping("/api/v1/boom")
            String explode() {
                throw new IllegalStateException("connection to " + SECRET_IN_THE_MESSAGE + " refused");
            }
        }
    }

    @Test
    void tellsTheCallerNothingAboutAnUnexpectedFailure() {
        ResponseEntity<JsonNode> response = api().get("/api/v1/boom");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().get("code").asString()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().get("detail").asString()).isEqualTo("The request could not be completed");
        assertThat(response.getBody().toString())
                .doesNotContain(SECRET_IN_THE_MESSAGE)
                .doesNotContain("IllegalStateException")
                .doesNotContain("com.example.simplebackend");
    }

    @Test
    void givesEveryFailureARequestIdToQuoteInABugReport() {
        ResponseEntity<JsonNode> response = api().get("/api/v1/boom");

        String header = response.getHeaders().getFirst(RequestIdFilter.HEADER);
        assertThat(header).isNotBlank();
        assertThat(response.getBody().get("requestId").asString()).isEqualTo(header);
    }

    @Test
    void answersAnUnknownPathWithTheSameEnvelopeAsEverythingElse() {
        ResponseEntity<JsonNode> response = api().get("/api/v1/nothing-here");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("code").asString()).isEqualTo("NOT_FOUND");
        assertThat(response.getBody().get("status").asInt()).isEqualTo(404);
    }

    @Test
    void reportsAMethodTheRouteDoesNotServe() {
        ResponseEntity<JsonNode> response = api().send(HttpMethod.PATCH, "/api/v1/users",
                MediaType.APPLICATION_JSON, "{}", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getBody().get("code").asString()).isEqualTo("METHOD_NOT_ALLOWED");
    }

    @Test
    void reportsAContentTypeItCannotRead() {
        ResponseEntity<JsonNode> response = api().send(HttpMethod.POST, "/api/v1/users",
                MediaType.TEXT_PLAIN, "hello", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(response.getBody().get("code").asString()).isEqualTo("UNSUPPORTED_MEDIA_TYPE");
    }

    @Test
    void doesNotQuoteAMalformedBodyBackAtTheCaller() {
        ResponseEntity<JsonNode> response = api().post("/api/v1/users", "{\"username\": \"unterminated");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("code").asString()).isEqualTo("MALFORMED_REQUEST");
        assertThat(response.getBody().toString()).doesNotContain("unterminated");
    }

    @Test
    void refusesABodyLargerThanTheConfiguredLimit() {
        String oversized = """
                {"username":"big","name":"%s","email":"big@example.com"}""".formatted("x".repeat(70_000));

        ResponseEntity<JsonNode> response = api().post("/api/v1/users", oversized);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
        assertThat(response.getBody().get("code").asString()).isEqualTo("PAYLOAD_TOO_LARGE");
        assertThat(response.getBody().get("detail").asString())
                .isEqualTo("Request body exceeds the 65536 byte limit");
    }
}
