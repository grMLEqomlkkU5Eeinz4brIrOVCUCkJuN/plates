package com.example.simplebackend;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/**
 * Talks to the running service over a real socket, so filters, status codes and
 * headers are exercised the way a caller would meet them.
 */
public final class ApiClient {

    private final RestClient client;

    public ApiClient(int port) {
        this.client = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                // The default factory is built on HttpURLConnection, which cannot
                // send PATCH, and one of these tests asks for exactly that.
                .requestFactory(new JdkClientHttpRequestFactory())
                // A 409 is a result to assert, not a reason to throw.
                .defaultStatusHandler(status -> true, (request, response) -> {
                })
                .build();
    }

    public ResponseEntity<JsonNode> get(String path) {
        return get(path, new HttpHeaders());
    }

    public ResponseEntity<JsonNode> get(String path, HttpHeaders headers) {
        return client.get().uri(path).headers(existing -> existing.addAll(headers))
                .retrieve().toEntity(JsonNode.class);
    }

    public ResponseEntity<JsonNode> post(String path, String json) {
        return send(HttpMethod.POST, path, MediaType.APPLICATION_JSON, json, null);
    }

    public ResponseEntity<JsonNode> put(String path, String json, String ifMatch) {
        return send(HttpMethod.PUT, path, MediaType.APPLICATION_JSON, json, ifMatch);
    }

    public ResponseEntity<JsonNode> delete(String path) {
        return client.method(HttpMethod.DELETE).uri(path).retrieve().toEntity(JsonNode.class);
    }

    public ResponseEntity<JsonNode> send(HttpMethod method, String path, MediaType contentType, String body,
                                         String ifMatch) {
        RestClient.RequestBodySpec request = client.method(method).uri(path).contentType(contentType);
        if (ifMatch != null) {
            request = request.header(HttpHeaders.IF_MATCH, ifMatch);
        }
        return request.body(body).retrieve().toEntity(JsonNode.class);
    }
}
