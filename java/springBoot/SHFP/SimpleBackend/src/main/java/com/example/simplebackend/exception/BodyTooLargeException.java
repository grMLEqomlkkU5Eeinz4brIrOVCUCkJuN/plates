package com.example.simplebackend.exception;

import java.io.IOException;

/**
 * Thrown from the request stream once a body passes the configured limit. It is an
 * IOException because that is what a reader of a servlet stream can throw, which
 * means it reaches the handler wrapped in a message conversion failure.
 */
public class BodyTooLargeException extends IOException {

    private final long limitBytes;

    public BodyTooLargeException(long limitBytes) {
        super("request body exceeds " + limitBytes + " bytes");
        this.limitBytes = limitBytes;
    }

    public long limitBytes() {
        return limitBytes;
    }
}
