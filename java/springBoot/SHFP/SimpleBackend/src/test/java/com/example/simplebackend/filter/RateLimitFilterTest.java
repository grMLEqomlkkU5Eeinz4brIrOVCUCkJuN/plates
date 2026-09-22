package com.example.simplebackend.filter;

import com.example.simplebackend.config.ApiProperties;
import com.example.simplebackend.exception.ProblemWriter;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitFilterTest {

    private final MovableClock clock = new MovableClock();

    @Test
    void allowsTheBurstThenRefusesWithARetryAfter() throws Exception {
        RateLimitFilter filter = filterWith(60, 3, 100);

        assertThat(statusesFor(filter, "10.0.0.1", 3)).containsExactly(200, 200, 200);

        MockHttpServletResponse refused = call(filter, "10.0.0.1");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getHeader("Retry-After")).isEqualTo("1");
        assertThat(refused.getContentAsString()).contains("\"code\":\"RATE_LIMITED\"");
    }

    @Test
    void refillsOnePermitPerSecondAtSixtyPerMinute() throws Exception {
        RateLimitFilter filter = filterWith(60, 2, 100);
        statusesFor(filter, "10.0.0.2", 2);
        assertThat(call(filter, "10.0.0.2").getStatus()).isEqualTo(429);

        clock.advance(Duration.ofSeconds(1));

        assertThat(call(filter, "10.0.0.2").getStatus()).isEqualTo(200);
        assertThat(call(filter, "10.0.0.2").getStatus()).isEqualTo(429);
    }

    @Test
    void neverRefillsPastTheBurstCapacity() throws Exception {
        RateLimitFilter filter = filterWith(60, 2, 100);
        statusesFor(filter, "10.0.0.3", 2);

        clock.advance(Duration.ofHours(1));

        assertThat(statusesFor(filter, "10.0.0.3", 3)).containsExactly(200, 200, 429);
    }

    @Test
    void countsEachCallerSeparately() throws Exception {
        RateLimitFilter filter = filterWith(60, 1, 100);

        assertThat(call(filter, "10.0.0.4").getStatus()).isEqualTo(200);
        assertThat(call(filter, "10.0.0.5").getStatus()).isEqualTo(200);
        assertThat(call(filter, "10.0.0.4").getStatus()).isEqualTo(429);
    }

    @Test
    void refusesANewCallerRatherThanGrowingPastTheTrackingLimit() throws Exception {
        RateLimitFilter filter = filterWith(60, 2, 2);
        call(filter, "10.0.0.6");
        call(filter, "10.0.0.7");

        // Both tracked buckets are mid-refill, so neither can be evicted and the
        // map is full. Admitting a third caller here is how the map grows without end.
        assertThat(call(filter, "10.0.0.8").getStatus()).isEqualTo(429);
    }

    /**
     * Running out of room to track callers is the limiter telling an operator it
     * is being flooded with distinct keys, so it has to reach the log the first
     * time it happens rather than on some later one.
     */
    @Test
    void warnsTheFirstTimeItRunsOutOfRoomToTrackCallers() throws Exception {
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(RateLimitFilter.class);
        ListAppender<ILoggingEvent> recorded = new ListAppender<>();
        recorded.start();
        logger.addAppender(recorded);
        try {
            RateLimitFilter filter = filterWith(60, 2, 2);
            call(filter, "10.0.1.1");
            call(filter, "10.0.1.2");
            call(filter, "10.0.1.3");

            assertThat(recorded.list).extracting(ILoggingEvent::getLevel).containsExactly(Level.WARN);
        } finally {
            logger.detachAppender(recorded);
        }
    }

    @Test
    void reclaimsRoomOnceATrackedCallerHasGoneQuiet() throws Exception {
        RateLimitFilter filter = filterWith(60, 2, 2);
        call(filter, "10.0.0.9");
        call(filter, "10.0.0.10");

        clock.advance(Duration.ofMinutes(5));

        assertThat(call(filter, "10.0.0.11").getStatus()).isEqualTo(200);
    }

    @Test
    void ignoresAForwardedForHeaderUnlessAProxyIsTrusted() throws Exception {
        RateLimitFilter filter = filterWith(60, 1, 100);
        MockHttpServletRequest first = request("10.0.0.12");
        first.addHeader("X-Forwarded-For", "1.1.1.1");
        MockHttpServletRequest second = request("10.0.0.12");
        second.addHeader("X-Forwarded-For", "2.2.2.2");

        assertThat(call(filter, first).getStatus()).isEqualTo(200);
        // A caller rotating this header would otherwise get a fresh bucket each time.
        assertThat(call(filter, second).getStatus()).isEqualTo(429);
    }

    private RateLimitFilter filterWith(int permitsPerMinute, int burstCapacity, int maxTrackedClients) {
        ApiProperties properties = new ApiProperties(
                List.of(),
                new ApiProperties.RateLimit(true, permitsPerMinute, burstCapacity, maxTrackedClients, false),
                65536);
        return new RateLimitFilter(properties, new ProblemWriter(JsonMapper.builder().build()), clock);
    }

    private List<Integer> statusesFor(RateLimitFilter filter, String ip, int calls) throws Exception {
        List<Integer> statuses = new java.util.ArrayList<>();
        for (int i = 0; i < calls; i++) {
            statuses.add(call(filter, ip).getStatus());
        }
        return statuses;
    }

    private MockHttpServletResponse call(RateLimitFilter filter, String ip) throws Exception {
        return call(filter, request(ip));
    }

    private MockHttpServletResponse call(RateLimitFilter filter, MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(200));
        return response;
    }

    private static MockHttpServletRequest request(String ip) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/users");
        request.setRemoteAddr(ip);
        return request;
    }

    private static final class MovableClock extends Clock {

        private Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration amount) {
            now = now.plus(amount);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }
}
