package com.example.simplebackend.exception;

/**
 * A failure the caller is told about verbatim. Its message reaches the client, so
 * it must never carry a query, a stack frame or another caller's data.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode code;

    public ApiException(ErrorCode code, String detail) {
        // No stack trace: these mark an outcome the handler already knows how to
        // report, and nothing ever reads the frames that collecting one would cost.
        super(detail, null, false, false);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }
}
