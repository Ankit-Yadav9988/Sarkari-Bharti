FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app

# pom.xml alone first, so the dependency download lands in its own layer and is
# reused on every build that did not change the dependency list. Copying src in
# the same step would re-download the world on every code change.
COPY pom.xml .

RUN mvn dependency:go-offline -B

COPY src ./src

RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=build /app/target/*.jar app.jar

# Run as a normal user. Nothing here writes to disk, so the only permission
# needed is reading the jar -- and if this process is ever made to run something
# it should not, being root inside the container is a far better starting point
# for whoever is driving than being a user who owns nothing.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin spring \
    && chown spring:spring /app/app.jar
USER spring

# Documentation only: the application binds $PORT when the platform sets one
# (see server.port in application.properties), and Render publishes whatever it
# finds listening. Kept at the local default so `docker run -p 8080:8080` works.
EXPOSE 8080

# JVM settings for a small container, as an env var so they can be changed from
# the hosting dashboard without a rebuild.
#
#   MaxRAMPercentage=70   The one that matters. The default is 25, so on a 512MB
#                         instance the heap is capped at ~128MB no matter how
#                         much is free -- and a Spring Boot app with Hibernate
#                         and a connection pool spends its life collecting
#                         garbage instead of answering. 70 gives ~358MB of heap
#                         and leaves ~154MB for metaspace, code cache and thread
#                         stacks, which is where the rest of a JVM lives. Going
#                         much higher trades heap for a container OOM kill, and
#                         the kernel does not ask first.
#   UseSerialGC           On one shared CPU, G1's background collector threads
#                         compete with the request that is waiting. The JVM
#                         already picks this itself below two CPUs; saying it
#                         keeps the choice from silently changing if the
#                         instance size does.
#   ExitOnOutOfMemoryError  A JVM that has run out of heap does not recover, it
#                         just fails every request slowly. Exiting lets the
#                         platform restart it, which is the only actual fix.
#
# Not set: -Dspring.main.lazy-initialization=true. It would measurably shorten
# startup, and it would do so by deferring the very beans whose constructors
# validate the secrets -- turning a refuse-to-boot into a 500 on whichever
# request first touched the missing value. Startup is not worth that.
#
# Worth trying if cold start is still the complaint: -XX:TieredStopAtLevel=1
# reaches first-response faster by not waiting for the optimising compiler, at
# the cost of steady-state throughput afterwards. Add it to JAVA_OPTS in the
# dashboard and compare; it is a genuine trade, not a free win.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"

# `exec` so java replaces the shell and becomes PID 1. Without it the shell is
# PID 1, SIGTERM goes to the shell, and the JVM is killed outright at the end of
# the grace period instead of shutting down -- which on this app means the
# buffered view counts that have not been flushed yet are simply lost on every
# redeploy. The shell is here only to expand $JAVA_OPTS, which the exec form of
# ENTRYPOINT cannot do.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
