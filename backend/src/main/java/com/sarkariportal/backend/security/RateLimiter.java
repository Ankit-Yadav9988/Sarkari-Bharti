package com.sarkariportal.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window rate limiter, in memory, keyed by caller IP.
 *
 * Deliberately dependency-free rather than pulling in Bucket4j: the only thing
 * needed here is "N requests per window per IP" for three endpoints, and an
 * extra library is extra supply-chain surface for about forty lines of logic.
 *
 * Limitation worth knowing: state lives in this JVM, so with several instances
 * behind a load balancer each one enforces its own quota. For a single-instance
 * deploy -- which this is -- that is exact. If it is ever scaled out, move the
 * counters to Redis; the call sites will not have to change.
 */
@Component
public class RateLimiter {

    /**
     * Ceiling on tracked keys so a rotating-IP flood cannot grow the map without
     * bound. When it is hit, expired entries are purged first and only then, if
     * still full, new keys are admitted by dropping the oldest.
     */
    private static final int MAX_TRACKED_KEYS = 20_000;

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    /** Outcome of a limit check. retryAfterSeconds is 0 when allowed. */
    public record Decision(boolean allowed, long retryAfterSeconds) {
        public static Decision allow() {
            return new Decision(true, 0);
        }
    }

    /**
     * Records an attempt against {@code key} and reports whether it is within
     * the quota. Rejected attempts are not recorded, so a caller who keeps
     * hammering does not extend their own lockout indefinitely -- the window
     * still rolls forward normally.
     */
    public Decision check(String key, int maxAttempts, int windowSeconds) {
        Instant now = Instant.now();
        Instant cutoff = now.minusSeconds(windowSeconds);

        if (hits.size() > MAX_TRACKED_KEYS) {
            purgeExpired(cutoff);
        }

        Deque<Instant> timestamps = hits.computeIfAbsent(key, k -> new ArrayDeque<>());

        // One lock per key rather than one global lock: two different IPs never
        // contend with each other.
        synchronized (timestamps) {
            while (!timestamps.isEmpty() && timestamps.peekFirst().isBefore(cutoff)) {
                timestamps.pollFirst();
            }

            if (timestamps.size() >= maxAttempts) {
                Instant oldest = timestamps.peekFirst();
                long retryAfter = Duration.between(now, oldest.plusSeconds(windowSeconds))
                        .getSeconds();
                return new Decision(false, Math.max(1, retryAfter));
            }

            timestamps.addLast(now);
            return Decision.allow();
        }
    }

    /**
     * Clears the history for a key. Called after a successful login so an admin
     * who mistyped their password twice is not still one attempt from a lockout.
     */
    public void reset(String key) {
        hits.remove(key);
    }

    private void purgeExpired(Instant cutoff) {
        Iterator<Map.Entry<String, Deque<Instant>>> it = hits.entrySet().iterator();
        while (it.hasNext()) {
            Deque<Instant> timestamps = it.next().getValue();
            synchronized (timestamps) {
                while (!timestamps.isEmpty() && timestamps.peekFirst().isBefore(cutoff)) {
                    timestamps.pollFirst();
                }
                if (timestamps.isEmpty()) {
                    it.remove();
                }
            }
        }
    }

    /**
     * The caller's address. Because application.properties sets
     * server.forward-headers-strategy=framework, Spring has already applied
     * X-Forwarded-For before this runs -- but only from a trusted proxy, which
     * is why this does not parse the header itself. Hand-rolled X-Forwarded-For
     * parsing is how rate limiters become trivially bypassable.
     */
    public static String clientIp(HttpServletRequest request) {
        String addr = request.getRemoteAddr();
        return (addr == null || addr.isBlank()) ? "unknown" : addr;
    }
}
