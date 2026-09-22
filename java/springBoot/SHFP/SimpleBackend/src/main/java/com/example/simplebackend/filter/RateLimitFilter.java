package com.example.simplebackend.filter;

import com.example.simplebackend.config.ApiProperties;
import com.example.simplebackend.exception.ErrorCode;
import com.example.simplebackend.exception.ProblemWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * A token bucket per caller, held in this process. It protects one instance from
 * one noisy caller. It is not a shared quota: behind N instances a caller gets N
 * times the allowance, and a restart forgets every bucket. Put a real limiter at
 * the edge when the quota has to be exact.
 */
@Component
@Order(RateLimitFilter.ORDER)
public class RateLimitFilter extends OncePerRequestFilter {

    static final int ORDER = RequestIdFilter.ORDER + 10;

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final long OVERFLOW_LOG_INTERVAL_MILLIS = 60_000;

    private final ApiProperties.RateLimit config;
    private final ProblemWriter problems;
    private final Clock clock;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    // Epoch, not Long.MIN_VALUE: the subtraction in logOverflow would overflow
    // against that and silence the very first warning.
    private final AtomicLong lastOverflowLogMillis = new AtomicLong(0);
    private final double refillPerMillis;

    RateLimitFilter(ApiProperties properties, ProblemWriter problems, Clock clock) {
        this.config = properties.rateLimit();
        this.problems = problems;
        this.clock = clock;
        this.refillPerMillis = config.permitsPerMinute() / 60_000.0;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !config.enabled();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        Decision decision = admit(clientKey(request));
        if (decision.admitted()) {
            chain.doFilter(request, response);
            return;
        }
        response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
        problems.write(request, response, ErrorCode.RATE_LIMITED,
                "Rate limit of %d requests per minute exceeded".formatted(config.permitsPerMinute()));
    }

    private Decision admit(String key) {
        long now = clock.millis();
        if (!buckets.containsKey(key) && buckets.size() >= config.maxTrackedClients()) {
            evictFullBuckets(now);
            if (buckets.size() >= config.maxTrackedClients()) {
                // More distinct callers than we agreed to remember. Growing the map
                // is how this process runs out of heap, so the request is refused.
                logOverflow(now);
                return new Decision(false, 1);
            }
        }
        // compute is atomic per key, so the refill and the spend cannot interleave
        // with another thread's. The verdict rides along on the value this call
        // produced, which is the one returned here.
        Bucket updated = buckets.compute(key, (ignored, current) -> {
            double tokens = current == null
                    ? config.burstCapacity()
                    : Math.min(config.burstCapacity(),
                               current.tokens() + (now - current.lastRefill()) * refillPerMillis);
            return tokens >= 1.0 ? new Bucket(tokens - 1.0, now, true) : new Bucket(tokens, now, false);
        });
        return updated.admitted()
                ? new Decision(true, 0)
                : new Decision(false, retryAfterSeconds(updated.tokens()));
    }

    private long retryAfterSeconds(double tokens) {
        double millis = (1.0 - tokens) / refillPerMillis;
        return Math.max(1, (long) Math.ceil(millis / 1000.0));
    }

    /**
     * A bucket back at full capacity holds no information: dropping it and letting
     * the next request recreate it at full capacity is the same behaviour.
     */
    private void evictFullBuckets(long now) {
        Iterator<Map.Entry<String, Bucket>> entries = buckets.entrySet().iterator();
        while (entries.hasNext()) {
            Bucket bucket = entries.next().getValue();
            if (bucket.tokens() + (now - bucket.lastRefill()) * refillPerMillis >= config.burstCapacity()) {
                entries.remove();
            }
        }
    }

    private void logOverflow(long now) {
        long last = lastOverflowLogMillis.get();
        if (now - last >= OVERFLOW_LOG_INTERVAL_MILLIS && lastOverflowLogMillis.compareAndSet(last, now)) {
            log.warn("rate limiter tracking {} clients, refusing requests from clients it cannot track",
                    config.maxTrackedClients());
        }
    }

    private String clientKey(HttpServletRequest request) {
        if (config.trustForwardedFor()) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                int comma = forwarded.indexOf(',');
                return (comma < 0 ? forwarded : forwarded.substring(0, comma)).strip();
            }
        }
        return request.getRemoteAddr();
    }

    private record Bucket(double tokens, long lastRefill, boolean admitted) {
    }

    private record Decision(boolean admitted, long retryAfterSeconds) {
    }
}
