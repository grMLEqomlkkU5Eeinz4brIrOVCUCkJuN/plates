package com.example.simplebackend.exception;

import com.example.simplebackend.filter.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;

/**
 * Writes the error body from inside a filter, where no controller advice runs, in
 * the same shape {@link ApiExceptionHandler} produces for everything else. Call it
 * instead of passing the request down the chain, never after: the response has to
 * still be uncommitted.
 */
@Component
public class ProblemWriter {

    private final ObjectMapper objectMapper;

    public ProblemWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code, String detail)
            throws IOException {

        ProblemDetail problem = code.problem(detail);
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("requestId", RequestIdFilter.of(request));

        response.setStatus(code.status().value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), problem);
        response.flushBuffer();
    }
}
