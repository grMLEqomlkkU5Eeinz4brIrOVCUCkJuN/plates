package com.example.simplebackend.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

/**
 * Settings this service owns, bound and validated at startup so a bad value stops
 * the boot instead of surfacing on the first request that depends on it.
 */
@Validated
@ConfigurationProperties(prefix = "api")
public record ApiProperties(

        // Empty leaves CORS off, the right default for a service with no browser client.
        @NotNull List<String> corsAllowedOrigins,

        @NotNull @Valid RateLimit rateLimit,

        @Min(1024) @Max(10_485_760) int maxRequestBodyBytes) {

    public record RateLimit(

            boolean enabled,
            @Min(1) int permitsPerMinute,
            @Min(1) int burstCapacity,
            @Min(1) int maxTrackedClients,

            // X-Forwarded-For is written by the client unless a proxy you control
            // overwrites it. Left off, the limiter keys on the socket address,
            // which a caller cannot forge.
            boolean trustForwardedFor) {
    }
}
