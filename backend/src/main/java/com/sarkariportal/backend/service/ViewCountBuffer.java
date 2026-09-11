package com.sarkariportal.backend.service;

import com.sarkariportal.backend.repository.JobRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Counts job views in memory and writes them out once a minute.
 *
 * The old counter did findById + save inside the request, so every visitor to
 * every job page caused a SELECT and a full-row UPDATE before the response
 * returned, and two simultaneous readers could each read 100 and each write
 * 101. On a site whose traffic pattern is "a result is declared and load goes up
 * a hundredfold in minutes", that write path is the first thing to fall over --
 * and it was doing it for a number displayed as decoration.
 *
 * Views now accumulate here and are flushed as one atomic increment per job.
 * The trade is explicit: if the process is killed between flushes, up to a
 * minute of view counts is lost. That is the right trade for a popularity
 * figure and the wrong one for anything that mattered.
 *
 * This class also owns view de-duplication, because "how views are counted" and
 * "the same visitor reloading is not ten views" are the same question. Keeping
 * it here rather than in RateLimiter is deliberate: the limiter's bounded map
 * holds login attempts, and cosmetic view traffic must not be able to evict
 * them.
 */
@Component
public class ViewCountBuffer {

    private static final Logger log = LoggerFactory.getLogger(ViewCountBuffer.class);

    /**
     * Ceiling on remembered viewers. Reached only under a flood; the response is
     * to forget everyone and start again, which over-counts some views. An
     * inflated popularity number is a better failure than unbounded memory.
     */
    private static final int MAX_DEDUP_KEYS = 50_000;

    /** Views counted since the last flush, per job id. */
    private final Map<Long, AtomicLong> pending = new ConcurrentHashMap<>();

    /**
     * Last total known to be in the database, per job id. Seeded by one cheap
     * projection query the first time a job is viewed after startup and kept
     * current here, so the endpoint returns a real running total without reading
     * the row on every request. Bounded by the number of jobs.
     */
    private final Map<Long, AtomicLong> knownTotals = new ConcurrentHashMap<>();

    /** When each viewer was last counted, keyed by "ip:jobId". */
    private final Map<String, Instant> lastCounted = new ConcurrentHashMap<>();

    private final JobRepository jobRepository;
    private final long dedupSeconds;

    public ViewCountBuffer(JobRepository jobRepository,
                           @Value("${viewcount.dedup-seconds}") long dedupSeconds) {
        this.jobRepository = jobRepository;
        this.dedupSeconds = dedupSeconds;
    }

    /**
     * Counts one view of {@code jobId} by {@code viewerKey} and returns the
     * total to show the visitor. A viewer who already opened this job inside the
     * de-duplication window is not counted again, but still gets the number --
     * the badge on the page must not blink out just because someone reloaded.
     *
     * @return the best-known total including views not yet written, or empty if
     *         the job does not exist
     */
    public Optional<Long> recordView(Long jobId, String viewerKey) {
        AtomicLong total = totalFor(jobId);
        if (total == null) {
            return Optional.empty();
        }
        if (alreadyCounted(viewerKey + ":" + jobId)) {
            return Optional.of(total.get());
        }
        pending.computeIfAbsent(jobId, id -> new AtomicLong()).incrementAndGet();
        return Optional.of(total.incrementAndGet());
    }

    /**
     * The running total for a job, or null when there is no such job. One
     * projection query per job per server lifetime; everything after that is a
     * map lookup.
     */
    private AtomicLong totalFor(Long jobId) {
        AtomicLong known = knownTotals.get(jobId);
        if (known != null) {
            return known;
        }
        Optional<Long> stored = jobRepository.findViewsById(jobId);
        if (stored.isEmpty()) {
            return null;
        }
        // computeIfAbsent, because two first-time viewers can race here and the
        // loser's value must not overwrite the winner's already-incremented one.
        return knownTotals.computeIfAbsent(jobId, id -> new AtomicLong(stored.get()));
    }

    /** True when this viewer was already counted inside the window. */
    private boolean alreadyCounted(String key) {
        if (dedupSeconds <= 0) {
            return false;       // de-duplication switched off by configuration
        }
        Instant now = Instant.now();
        Instant cutoff = now.minusSeconds(dedupSeconds);

        Instant previous = lastCounted.get(key);
        if (previous != null && previous.isAfter(cutoff)) {
            return true;
        }
        if (lastCounted.size() >= MAX_DEDUP_KEYS) {
            purgeViewers(cutoff);
            if (lastCounted.size() >= MAX_DEDUP_KEYS) {
                lastCounted.clear();
            }
        }
        lastCounted.put(key, now);
        return false;
    }

    /**
     * Writes the accumulated counts. Once a minute is often enough that the
     * displayed number is never far off, and rare enough that a traffic spike
     * costs one UPDATE per job per minute instead of one per visitor.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void flush() {
        Map<Long, Long> batch = drain();
        if (batch.isEmpty()) {
            return;
        }

        Map<Long, Long> failed = new HashMap<>();
        batch.forEach((jobId, delta) -> {
            try {
                // incrementViews carries its own @Transactional, so each job is
                // an independent statement: one failure can neither roll back
                // nor double-count the others.
                if (jobRepository.incrementViews(jobId, delta) == 0) {
                    forget(jobId);      // deleted while its views were buffered
                }
            } catch (RuntimeException e) {
                failed.put(jobId, delta);
            }
        });

        if (!failed.isEmpty()) {
            // Put back only what was not written, so the next run retries it
            // exactly once. Losing a popularity figure is acceptable; losing it
            // silently is not.
            failed.forEach((jobId, delta) ->
                    pending.computeIfAbsent(jobId, id -> new AtomicLong()).addAndGet(delta));
            log.warn("Could not flush view counts for {} job(s), retrying next run", failed.size());
        }
    }

    /**
     * Takes the pending counts by draining each counter to zero rather than
     * clearing the map: a view arriving during the drain lands in the same
     * counter and is picked up next time instead of being dropped.
     */
    private Map<Long, Long> drain() {
        if (pending.isEmpty()) {
            return Map.of();
        }
        Map<Long, Long> batch = new HashMap<>();
        for (Map.Entry<Long, AtomicLong> entry : pending.entrySet()) {
            long delta = entry.getValue().getAndSet(0);
            if (delta > 0) {
                batch.put(entry.getKey(), delta);
            }
        }
        return batch;
    }

    /** Drops all state for a job that no longer exists. */
    private void forget(Long jobId) {
        knownTotals.remove(jobId);
        pending.remove(jobId);
    }

    private void purgeViewers(Instant cutoff) {
        Iterator<Map.Entry<String, Instant>> it = lastCounted.entrySet().iterator();
        while (it.hasNext()) {
            if (it.next().getValue().isBefore(cutoff)) {
                it.remove();
            }
        }
    }

    /** Last chance to persist counts on an orderly shutdown or redeploy. */
    @PreDestroy
    public void flushOnShutdown() {
        try {
            flush();
        } catch (RuntimeException e) {
            log.warn("Could not flush view counts during shutdown: {}", e.getMessage());
        }
    }
}
