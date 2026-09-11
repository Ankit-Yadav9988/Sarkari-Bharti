package com.sarkariportal.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Is the site actually up?
 *
 * Exists because the deployment depends on something cheap to poll. The server
 * this runs on is kept alive by an uptime monitor hitting it every few minutes,
 * and pointing that monitor at a real listing endpoint would mean a database
 * query and a JSON page render several hundred times a day purely so a robot can
 * be told "yes". This answers the same question for almost nothing.
 *
 * It checks the database rather than only reporting that the JVM is running.
 * A process that is alive but cannot reach Postgres serves 500s on every page,
 * and a health check that calls that "ok" is worse than no health check at all --
 * the monitor stays quiet through exactly the outage it was installed to catch.
 *
 * Connection.isValid() is used instead of a query because Hikari hands back an
 * already-open pooled connection and isValid() is a driver-level ping on it, so
 * the check costs a round trip and no parsing or planning.
 *
 * Deliberately says nothing else. No version, no uptime, no hostname, no
 * exception text: this endpoint is public and unauthenticated, and every extra
 * field is something an attacker gets for free. "up" or "down" is the whole
 * contract.
 *
 * Base URL: /api/health
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    /** Seconds the driver may spend deciding whether the connection is usable. */
    private static final int DB_CHECK_TIMEOUT_SECONDS = 2;

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /**
     * 200 when the database answers, 503 when it does not.
     *
     * The status code carries the signal, not the body: uptime monitors and load
     * balancers alert on the code, and most never look at what was returned.
     */
    @GetMapping
    public ResponseEntity<Map<String, String>> health() {
        boolean dbUp = databaseResponds();

        Map<String, String> body = new LinkedHashMap<>();
        body.put("status", dbUp ? "ok" : "degraded");
        body.put("db", dbUp ? "up" : "down");

        return dbUp
                ? ResponseEntity.ok(body)
                : ResponseEntity.status(503).body(body);
    }

    /**
     * Every failure is the same answer: down.
     *
     * Catching Exception rather than SQLException on purpose. A pool that has
     * given up throws its own unchecked exceptions on getConnection(), and a
     * health endpoint that itself 500s with a stack trace is both an outage of
     * the thing meant to report outages and a way to read the internals off a
     * public URL.
     */
    private boolean databaseResponds() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(DB_CHECK_TIMEOUT_SECONDS);
        } catch (Exception e) {
            return false;
        }
    }
}
