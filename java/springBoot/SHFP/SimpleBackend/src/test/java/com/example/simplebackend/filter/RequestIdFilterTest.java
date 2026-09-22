package com.example.simplebackend.filter;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @Test
    void generatesAnIdWhenTheCallerSendsNone() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        String duringRequest = run(new MockHttpServletRequest(), response);

        assertThat(duringRequest).isNotNull();
        assertThat(UUID.fromString(duringRequest)).isNotNull();
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo(duringRequest);
    }

    @Test
    void keepsACallerSuppliedIdSoTheTraceSpansBothServices() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(RequestIdFilter.HEADER, "edge-7f3a_91");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(run(request, response)).isEqualTo("edge-7f3a_91");
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("edge-7f3a_91");
    }

    @Test
    void replacesAnIdCarryingALineBreakRatherThanLoggingIt() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(RequestIdFilter.HEADER, "abc\r\nINFO forged log line");

        String assigned = run(request, new MockHttpServletResponse());

        assertThat(assigned).doesNotContain("forged");
        assertThat(UUID.fromString(assigned)).isNotNull();
    }

    @Test
    void replacesAnOverlongId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(RequestIdFilter.HEADER, "x".repeat(65));

        assertThat(run(request, new MockHttpServletResponse())).hasSize(36);
    }

    @Test
    void clearsTheLoggingContextSoThePooledThreadDoesNotKeepIt() throws Exception {
        run(new MockHttpServletRequest(), new MockHttpServletResponse());

        assertThat(MDC.get("requestId")).isNull();
    }

    /** Returns the id visible to the logging context while the request was running. */
    private String run(MockHttpServletRequest request, MockHttpServletResponse response) throws Exception {
        AtomicReference<String> seen = new AtomicReference<>();
        filter.doFilter(request, response, (req, res) -> seen.set(MDC.get("requestId")));
        return seen.get();
    }
}
