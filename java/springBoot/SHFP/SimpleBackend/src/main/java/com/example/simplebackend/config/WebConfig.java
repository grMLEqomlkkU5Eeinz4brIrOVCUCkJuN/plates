package com.example.simplebackend.config;

import com.example.simplebackend.filter.RequestIdFilter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Clock;
import java.util.List;

@Configuration
@EnableConfigurationProperties(ApiProperties.class)
class WebConfig implements WebMvcConfigurer {

    private final ApiProperties properties;

    WebConfig(ApiProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = properties.corsAllowedOrigins();
        if (origins.isEmpty()) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("Content-Type", "If-Match", RequestIdFilter.HEADER)
                .exposedHeaders("ETag", RequestIdFilter.HEADER);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
