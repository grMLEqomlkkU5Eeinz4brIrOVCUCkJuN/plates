package com.example.simplebackend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

/**
 * The closed set of failures this API reports. Clients branch on the {@code code}
 * field of the response body, never on the wording of {@code title} or
 * {@code detail}, which are free to change.
 */
public enum ErrorCode {

    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed"),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "Malformed request"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Resource not found"),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed"),
    PRECONDITION_FAILED(HttpStatus.PRECONDITION_FAILED, "Precondition failed"),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported media type"),
    USERNAME_TAKEN(HttpStatus.CONFLICT, "Username already taken"),
    EMAIL_TAKEN(HttpStatus.CONFLICT, "Email already registered"),
    CONCURRENT_MODIFICATION(HttpStatus.CONFLICT, "Resource changed since it was read"),
    PAYLOAD_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "Request body too large"),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Too many requests"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error");

    private final HttpStatus status;
    private final String title;

    ErrorCode(HttpStatus status, String title) {
        this.status = status;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    /**
     * Builds the body every failure response uses. The {@code type} stays
     * {@code about:blank} because this project publishes no per-error documents;
     * {@code code} carries the machine readable meaning instead.
     */
    public ProblemDetail problem(String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("code", name());
        return problem;
    }

    /** Fallback for framework failures that have no dedicated code. */
    static ErrorCode forStatus(HttpStatusCode status) {
        if (status.is5xxServerError()) {
            return INTERNAL_ERROR;
        }
        return switch (status.value()) {
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 412 -> PRECONDITION_FAILED;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 429 -> RATE_LIMITED;
            default -> VALIDATION_FAILED;
        };
    }
}
