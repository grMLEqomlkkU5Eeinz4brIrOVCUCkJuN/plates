package com.example.simplebackend.config;

import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.util.PlaceholderResolutionException;

import java.util.ArrayList;
import java.util.List;

/**
 * Stops the boot when a connection setting is missing, before any bean is built.
 * Left to run, a missing DB_URL surfaces much later as Hikari rejecting a url that
 * does not start with "jdbc", and only one variable per restart: this reports all
 * of them at once and names each.
 */
public class StartupConfigCheck implements ApplicationListener<ApplicationEnvironmentPreparedEvent> {

    private static final List<String> REQUIRED = List.of(
            "spring.datasource.url",
            "spring.datasource.username",
            "spring.datasource.password");

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        ConfigurableEnvironment environment = event.getEnvironment();
        List<String> problems = new ArrayList<>();

        for (String property : REQUIRED) {
            try {
                if (environment.getProperty(property) == null) {
                    problems.add(property + " is not set");
                }
            } catch (PlaceholderResolutionException unresolved) {
                problems.add(property + ": " + unresolved.getMessage());
            }
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Cannot start. " + String.join(". ", problems)
                    + ". These carry database credentials and are never defaulted.");
        }
    }
}
