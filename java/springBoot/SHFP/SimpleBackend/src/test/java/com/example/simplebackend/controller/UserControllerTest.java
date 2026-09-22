package com.example.simplebackend.controller;

import com.example.simplebackend.PostgresTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "api.rate-limit.enabled=false")
class UserControllerTest extends PostgresTestBase {

    @Test
    void createsAUserAndReportsWhereItLives() {
        ResponseEntity<JsonNode> response = post("""
                {"username":"ada","name":"Ada Lovelace","email":"ada@example.com"}""");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION)).isEqualTo("/api/v1/users/1");
        assertThat(response.getHeaders().getETag()).isEqualTo("\"0\"");
        assertThat(response.getBody().get("username").asString()).isEqualTo("ada");
        assertThat(response.getBody().get("version").asInt()).isZero();
    }

    @Test
    void lowercasesAndTrimsSoTwoSpellingsCannotBothBeStored() {
        post("""
                {"username":"Ada","name":"  Ada Lovelace  ","email":"ADA@Example.COM"}""");

        ResponseEntity<JsonNode> stored = api().get("/api/v1/users/1");
        assertThat(stored.getBody().get("username").asString()).isEqualTo("ada");
        assertThat(stored.getBody().get("email").asString()).isEqualTo("ada@example.com");
        assertThat(stored.getBody().get("name").asString()).isEqualTo("Ada Lovelace");

        ResponseEntity<JsonNode> second = post("""
                {"username":"ADA","name":"Impostor","email":"other@example.com"}""");
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(second.getBody().get("code").asString()).isEqualTo("USERNAME_TAKEN");
    }

    @Test
    void reportsWhichUniqueConstraintTheCallerHit() {
        post("""
                {"username":"ada","name":"Ada","email":"ada@example.com"}""");

        ResponseEntity<JsonNode> sameEmail = post("""
                {"username":"grace","name":"Grace","email":"ADA@example.com"}""");

        assertThat(sameEmail.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(sameEmail.getBody().get("code").asString()).isEqualTo("EMAIL_TAKEN");
    }

    @Test
    void namesEveryFieldThatFailedValidationAtOnce() {
        ResponseEntity<JsonNode> response = post("""
                {"username":"a!","name":"","email":"not-an-email"}""");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("code").asString()).isEqualTo("VALIDATION_FAILED");
        JsonNode errors = response.getBody().get("errors");
        assertThat(errors.propertyNames()).containsExactlyInAnyOrder("username", "name", "email");
    }

    @Test
    void refusesAFieldTheEndpointDoesNotDeclareRatherThanIgnoringIt() {
        ResponseEntity<JsonNode> response = post("""
                {"id":500,"version":99,"username":"ada","name":"Ada","email":"ada@example.com"}""");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("errors").get("id").asString()).isEqualTo("is not a field of this request");
    }

    @Test
    void rejectsAUsernameAtThirtyThreeCharactersAndAcceptsThirtyTwo() {
        assertThat(post("""
                {"username":"%s","name":"Long","email":"long@example.com"}"""
                .formatted("a".repeat(32))).getStatusCode()).isEqualTo(HttpStatus.CREATED);

        assertThat(post("""
                {"username":"%s","name":"Longer","email":"longer@example.com"}"""
                .formatted("b".repeat(33))).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void returnsAnEmptyPageRatherThanFailingWhenThereAreNoUsers() {
        ResponseEntity<JsonNode> page = api().get("/api/v1/users?limit=10");

        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(page.getBody().get("items")).isEmpty();
        assertThat(page.getBody().get("nextAfter").isNull()).isTrue();
    }

    @Test
    void walksEveryUserExactlyOnceAcrossPages() {
        IntStream.rangeClosed(1, 7).forEach(this::createUser);

        ResponseEntity<JsonNode> first = api().get("/api/v1/users?limit=3");
        assertThat(ids(first)).containsExactly(1, 2, 3);
        assertThat(first.getBody().get("nextAfter").asInt()).isEqualTo(3);

        ResponseEntity<JsonNode> second = api().get("/api/v1/users?limit=3&after=3");
        assertThat(ids(second)).containsExactly(4, 5, 6);

        ResponseEntity<JsonNode> last = api().get("/api/v1/users?limit=3&after=6");
        assertThat(ids(last)).containsExactly(7);
        assertThat(last.getBody().get("nextAfter").isNull()).isTrue();
    }

    @Test
    void reportsNoNextPageWhenTheLastPageIsExactlyFull() {
        IntStream.rangeClosed(1, 6).forEach(this::createUser);

        ResponseEntity<JsonNode> page = api().get("/api/v1/users?limit=3&after=3");

        assertThat(ids(page)).containsExactly(4, 5, 6);
        assertThat(page.getBody().get("nextAfter").isNull()).isTrue();
    }

    @Test
    void capsThePageSizeTheCallerCanAskFor() {
        ResponseEntity<JsonNode> tooBig = api().get("/api/v1/users?limit=101");

        assertThat(tooBig.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(tooBig.getBody().get("errors").get("limit").asString())
                .isEqualTo("must be less than or equal to 100");
        assertThat(api().get("/api/v1/users?limit=100").getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(api().get("/api/v1/users?limit=0").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void refusesAnUpdateThatQuotesAVersionTheUserHasMovedPast() {
        createUser(1);
        update(1, """
                {"name":"Second","email":"second@example.com"}""", "\"0\"");

        ResponseEntity<JsonNode> stale = update(1, """
                {"name":"Third","email":"third@example.com"}""", "\"0\"");

        assertThat(stale.getStatusCode()).isEqualTo(HttpStatus.PRECONDITION_FAILED);
        assertThat(stale.getBody().get("code").asString()).isEqualTo("PRECONDITION_FAILED");
        assertThat(api().get("/api/v1/users/1").getBody().get("name").asString())
                .isEqualTo("Second");
    }

    @Test
    void acceptsAnUpdateQuotingTheCurrentVersionAndMovesItOn() {
        createUser(1);

        ResponseEntity<JsonNode> updated = update(1, """
                {"name":"Renamed","email":"renamed@example.com"}""", "\"0\"");

        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getHeaders().getETag()).isEqualTo("\"1\"");
        assertThat(updated.getBody().get("version").asInt()).isEqualTo(1);
    }

    @Test
    void refusesAnIfMatchItCouldNotHaveIssued() {
        createUser(1);

        assertThat(update(1, """
                {"name":"x","email":"x@example.com"}""", "not-a-version").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(update(1, """
                {"name":"x","email":"x@example.com"}""", "W/\"0\"").getStatusCode())
                .isEqualTo(HttpStatus.PRECONDITION_FAILED);
    }

    @Test
    void keepsTheUsernameOutOfReachOfAnUpdate() {
        createUser(1);

        ResponseEntity<JsonNode> response = update(1, """
                {"username":"stolen","name":"x","email":"x@example.com"}""", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(api().get("/api/v1/users/1").getBody().get("username").asString())
                .isEqualTo("user1");
    }

    @Test
    void answersTheSameWayWhetherOrNotTheDeleteAlreadyHappened() {
        createUser(1);

        assertThat(delete(1).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(delete(1).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(delete(4242).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(api().get("/api/v1/users/1").getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void saysWhichUserIsMissingWithoutLeakingAnythingElse() {
        ResponseEntity<JsonNode> response = api().get("/api/v1/users/999");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("code").asString()).isEqualTo("NOT_FOUND");
        assertThat(response.getBody().get("detail").asString()).isEqualTo("No user with id 999");
        assertThat(response.getBody().has("stackTrace")).isFalse();
        assertThat(response.getBody().has("trace")).isFalse();
    }

    @Test
    void carriesTheCallersRequestIdThroughToTheErrorBody() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Request-Id", "checkout-91");

        ResponseEntity<JsonNode> response = api().get("/api/v1/users/999", headers);

        assertThat(response.getHeaders().getFirst("X-Request-Id")).isEqualTo("checkout-91");
        assertThat(response.getBody().get("requestId").asString()).isEqualTo("checkout-91");
    }

    private void createUser(int n) {
        ResponseEntity<JsonNode> created = post("""
                {"username":"user%d","name":"User %d","email":"user%d@example.com"}""".formatted(n, n, n));
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    private ResponseEntity<JsonNode> post(String body) {
        return api().post("/api/v1/users", body);
    }

    private ResponseEntity<JsonNode> update(long id, String body, String ifMatch) {
        return api().put("/api/v1/users/" + id, body, ifMatch);
    }

    private ResponseEntity<JsonNode> delete(long id) {
        return api().delete("/api/v1/users/" + id);
    }

    private static java.util.List<Integer> ids(ResponseEntity<JsonNode> page) {
        return page.getBody().get("items").valueStream().map(item -> item.get("id").asInt()).toList();
    }
}
