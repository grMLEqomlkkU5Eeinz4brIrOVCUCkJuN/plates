# Build and runtime are separate images so the JDK, the Maven cache and the
# source never ship to production.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build

# Dependencies resolve in their own layer, so editing a source file does not
# re-download the world.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw --batch-mode --no-transfer-progress dependency:go-offline

COPY src/ src/
# Tests are skipped here on purpose: they start a Postgres container, which this
# build cannot do. CI runs them before anything reaches a registry.
RUN ./mvnw --batch-mode --no-transfer-progress package -DskipTests \
    && java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination /build/extracted

FROM eclipse-temurin:25-jre
# curl is here for the health check below and nothing else.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 app

WORKDIR /app
USER app

# Copied in the order they change: the application layer is last so a code
# change rebuilds only it.
COPY --from=build --chown=app:app /build/extracted/dependencies/ ./
COPY --from=build --chown=app:app /build/extracted/spring-boot-loader/ ./
COPY --from=build --chown=app:app /build/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=app:app /build/extracted/application/ ./

# 8080 serves the API. 8081 serves health and info and is not meant to be
# published past the orchestrator.
EXPOSE 8080 8081

HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
    CMD curl --fail --silent --show-error http://localhost:8081/actuator/health/readiness || exit 1

# MaxRAMPercentage because the JVM's default claims a quarter of the container
# limit. ExitOnOutOfMemoryError because an instance that has run out of heap
# should be replaced, not left answering some requests and not others.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", \
            "org.springframework.boot.loader.launch.JarLauncher"]
