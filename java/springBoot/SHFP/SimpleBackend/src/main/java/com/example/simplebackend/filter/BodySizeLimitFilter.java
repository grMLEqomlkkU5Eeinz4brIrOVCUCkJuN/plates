package com.example.simplebackend.filter;

import com.example.simplebackend.config.ApiProperties;
import com.example.simplebackend.exception.BodyTooLargeException;
import com.example.simplebackend.exception.ErrorCode;
import com.example.simplebackend.exception.ProblemWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Caps how much request body this service will read. Tomcat's max-http-form-post-size
 * only covers form encoded bodies, so without this a JSON body has no limit at all
 * and one caller can hand the parser as much as it is willing to send.
 */
@Component
@Order(BodySizeLimitFilter.ORDER)
public class BodySizeLimitFilter extends OncePerRequestFilter {

    static final int ORDER = RateLimitFilter.ORDER + 10;

    private final long limitBytes;
    private final ProblemWriter problems;

    BodySizeLimitFilter(ApiProperties properties, ProblemWriter problems) {
        this.limitBytes = properties.maxRequestBodyBytes();
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (request.getContentLengthLong() > limitBytes) {
            problems.write(request, response, ErrorCode.PAYLOAD_TOO_LARGE,
                    "Request body exceeds the %d byte limit".formatted(limitBytes));
            return;
        }
        // Content-Length is absent on a chunked request and is a claim in any case,
        // so the count that decides is the one taken while reading.
        chain.doFilter(new LimitedBodyRequest(request, limitBytes), response);
    }

    private static final class LimitedBodyRequest extends HttpServletRequestWrapper {

        private final long limitBytes;
        private ServletInputStream stream;
        private BufferedReader reader;

        LimitedBodyRequest(HttpServletRequest request, long limitBytes) {
            super(request);
            this.limitBytes = limitBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                stream = new LimitedStream(super.getInputStream(), limitBytes);
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (reader == null) {
                String encoding = getCharacterEncoding();
                reader = new BufferedReader(new InputStreamReader(getInputStream(),
                        encoding != null ? encoding : "UTF-8"));
            }
            return reader;
        }
    }

    private static final class LimitedStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private final long limitBytes;
        private long consumed;

        LimitedStream(ServletInputStream delegate, long limitBytes) {
            this.delegate = delegate;
            this.limitBytes = limitBytes;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value != -1) {
                count(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = delegate.read(buffer, offset, length);
            if (read > 0) {
                count(read);
            }
            return read;
        }

        private void count(int bytes) throws BodyTooLargeException {
            consumed += bytes;
            if (consumed > limitBytes) {
                throw new BodyTooLargeException(limitBytes);
            }
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener listener) {
            delegate.setReadListener(listener);
        }

        @Override
        public int available() throws IOException {
            return delegate.available();
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }
}
