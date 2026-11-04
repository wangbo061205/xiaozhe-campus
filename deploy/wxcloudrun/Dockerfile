FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN apk add --no-cache fontconfig ttf-dejavu \
    && addgroup -S -g 10001 campus && adduser -S -D -H -u 10001 -G campus campus \
    && mkdir -p /app/knowledge && chown -R campus:campus /app
COPY --from=build --chown=campus:campus /build/target/campus-agent-*.jar /app/campus-agent.jar
COPY --chown=campus:campus knowledge/official-knowledge.csv.gz /app/knowledge/official-knowledge.csv.gz
ENV TZ=Asia/Shanghai \
    SPRING_PROFILES_ACTIVE=production,wxcloudrun \
    PORT=8080
USER campus
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --retries=5 \
    CMD wget -q --spider http://127.0.0.1:8080/api/v1/config/public || exit 1
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-XX:MaxRAMPercentage=70", "-jar", "/app/campus-agent.jar"]
