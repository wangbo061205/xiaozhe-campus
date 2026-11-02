FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S -g 10001 campus && adduser -S -D -H -u 10001 -G campus campus \
    && mkdir -p /app/data/lost-found-images && chown -R campus:campus /app
COPY --from=build --chown=campus:campus /build/target/campus-agent-*.jar /app/campus-agent.jar
USER campus
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
    CMD wget -q --spider http://127.0.0.1:8080/api/v1/config/public || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/campus-agent.jar"]
