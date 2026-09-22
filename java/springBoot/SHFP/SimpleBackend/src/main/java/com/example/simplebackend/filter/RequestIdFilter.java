package com.example.simplebackend.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Gives every request an id, puts it in the logging context and echoes it back so
 * a caller reporting a failure can name the exact request in the logs.
 */
@Component
@Order(RequestIdFilter.ORDER)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 10;
    public static final String HEADER = "X-Request-Id";

    private static final String ATTRIBUTE = RequestIdFilter.class.getName();
    private static final String MDC_KEY = "requestId";

    // An inbound id is repeated on every log line for the request, so accept it
    // only in a shape that cannot forge a line break or pad the log with 8KB.
    private static final Pattern ACCEPTED = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String inbound = request.getHeader(HEADER);
        String requestId = inbound != null && ACCEPTED.matcher(inbound).matches()
                ? inbound
                : UUID.randomUUID().toString();

        request.setAttribute(ATTRIBUTE, requestId);
        // Set before the chain runs: a response that commits early still carries it.
        response.setHeader(HEADER, requestId);
        MDC.put(MDC_KEY, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    /** The id assigned to this request, or null if the filter did not run. */
    public static String of(HttpServletRequest request) {
        return (String) request.getAttribute(ATTRIBUTE);
    }
}
