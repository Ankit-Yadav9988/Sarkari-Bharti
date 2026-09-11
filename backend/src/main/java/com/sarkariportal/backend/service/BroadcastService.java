package com.sarkariportal.backend.service;

import com.sarkariportal.backend.config.BadRequestException;
import com.sarkariportal.backend.dto.BroadcastRequest;
import com.sarkariportal.backend.dto.BroadcastStatusResponse;
import com.sarkariportal.backend.model.EmailBroadcast;
import com.sarkariportal.backend.model.Subscriber;
import com.sarkariportal.backend.repository.EmailBroadcastRepository;
import com.sarkariportal.backend.repository.SubscriberRepository;
import com.sarkariportal.backend.util.LogSafe;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs one job-alert broadcast at a time, in the background.
 *
 * Why background and not just a long request: sending to a few hundred
 * addresses over SMTP takes minutes, and a request that runs for minutes gets
 * cut off by a proxy, a browser, or the reader's patience -- and there is no
 * way afterwards to tell how far it got. Instead the endpoint returns straight
 * away and the console polls {@link #status()}.
 *
 * One at a time is enforced with a compare-and-set rather than a lock, because
 * the second caller should be told "a send is already running" immediately
 * instead of queueing behind the first and mailing the whole list twice. On a
 * free plan with a daily cap, a double send is not a slow send -- it is the
 * rest of the day's allowance gone.
 *
 * Not restart-safe, and deliberately not pretending to be: if the server is
 * redeployed mid-send, the in-memory progress is lost and the database row
 * keeps a null finished_at. That is visible rather than silent, and building
 * resumable delivery on top of a free instance that sleeps would be a much
 * larger machine than this site needs.
 */
@Service
public class BroadcastService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastService.class);

    /** Above this an alert stops being an alert and becomes a newsletter nobody reads. */
    private static final int MAX_ITEMS = 30;
    private static final int MAX_SUBJECT_LENGTH = 150;
    private static final int MAX_HEADING_LENGTH = 200;
    private static final int MAX_TITLE_LENGTH = 250;
    private static final int MAX_META_LENGTH = 250;
    private static final int MAX_URL_LENGTH = 500;
    private static final int MAX_ERROR_LENGTH = 500;

    private final SubscriberRepository subscriberRepository;
    private final EmailBroadcastRepository broadcastRepository;

    /**
     * Absent when mail.enabled is false -- which is the normal state of a fresh
     * deployment, so it has to be a supported one rather than a startup crash.
     */
    private final ObjectProvider<MailService> mailService;

    private final String siteName;
    private final String siteUrl;
    private final int maxRecipients;
    private final long sendDelayMs;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "email-broadcast");
        t.setDaemon(true); // must not keep the JVM alive on shutdown
        return t;
    });

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicReference<BroadcastStatusResponse> latest = new AtomicReference<>(null);

    public BroadcastService(SubscriberRepository subscriberRepository,
                            EmailBroadcastRepository broadcastRepository,
                            ObjectProvider<MailService> mailService,
                            @Value("${site.name:Sarkari Bharti}") String siteName,
                            @Value("${site.public-url:}") String sitePublicUrl,
                            @Value("${cors.allowed-origins:}") String corsOrigins,
                            @Value("${mail.max-recipients:2000}") int maxRecipients,
                            @Value("${mail.send-delay-ms:200}") long sendDelayMs) {
        this.subscriberRepository = subscriberRepository;
        this.broadcastRepository = broadcastRepository;
        this.mailService = mailService;
        this.siteName = siteName;
        this.siteUrl = resolveSiteUrl(sitePublicUrl, corsOrigins);
        this.maxRecipients = maxRecipients;
        this.sendDelayMs = Math.max(0, sendDelayMs);
    }

    /**
     * Where the links in an alert point.
     *
     * Falls back to the first CORS origin when SITE_PUBLIC_URL is unset. That
     * is not a guess: the frontend origin is already configured for CORS and
     * getting it wrong there breaks the whole site immediately, so it is the
     * one value on this server that is reliably correct. One env var fewer to
     * set is one fewer to set wrong -- and a wrong value here is only
     * discovered when a subscriber clicks a dead link.
     */
    private static String resolveSiteUrl(String explicit, String corsOrigins) {
        String chosen = (explicit != null && !explicit.isBlank())
                ? explicit
                : (corsOrigins == null ? "" : corsOrigins.split(",")[0]);
        chosen = chosen == null ? "" : chosen.trim();
        if (chosen.isEmpty()) {
            chosen = "http://localhost:3000";
        }
        return chosen.replaceAll("/+$", "");
    }

    // ---- status ----

    public BroadcastStatusResponse status() {
        if (!mailConfigured()) {
            return BroadcastStatusResponse.notConfigured();
        }
        BroadcastStatusResponse snapshot = latest.get();
        return snapshot == null ? BroadcastStatusResponse.idle() : snapshot;
    }

    public boolean mailConfigured() {
        return mailService.getIfAvailable() != null;
    }

    // ---- starting a send ----

    /**
     * Validates, claims the single send slot, and hands the work to the
     * background thread. Returns the status the console should show first.
     */
    public BroadcastStatusResponse start(BroadcastRequest request) {
        MailService mail = mailService.getIfAvailable();
        if (mail == null) {
            throw new BadRequestException(
                    "Email is not set up on the server yet. Set MAIL_ENABLED=true and the "
                            + "MAIL_* variables, then redeploy.");
        }

        String subject = requireText(request == null ? null : request.subject(),
                "subject", MAX_SUBJECT_LENGTH);
        String heading = optionalText(request.heading(), MAX_HEADING_LENGTH);
        List<BroadcastRequest.Item> items = cleanItems(request.items());

        List<Subscriber> recipients = subscriberRepository.findAll(Sort.by("id"));
        if (recipients.isEmpty()) {
            throw new BadRequestException("There are no subscribers to send to yet.");
        }
        if (recipients.size() > maxRecipients) {
            throw new BadRequestException(
                    "The list has " + recipients.size() + " addresses, above the configured "
                            + "limit of " + maxRecipients + ". Raise MAIL_MAX_RECIPIENTS if this "
                            + "is expected.");
        }

        // Claim the slot BEFORE doing anything else observable. Two clicks on a
        // slow connection arrive as two requests, and the loser has to be told
        // no rather than start a second copy of the same send.
        if (!running.compareAndSet(false, true)) {
            throw new BadRequestException("A send is already running. Wait for it to finish.");
        }

        EmailBroadcast record;
        try {
            record = new EmailBroadcast();
            record.setSubject(subject);
            record.setRecipientCount(recipients.size());
            record.setStartedAt(Instant.now());
            record = broadcastRepository.save(record);
        } catch (RuntimeException e) {
            running.set(false); // never leave the slot claimed on a failed start
            throw e;
        }

        BroadcastStatusResponse initial = new BroadcastStatusResponse(
                true, true, subject, recipients.size(), 0, 0, record.getStartedAt(), null, null);
        latest.set(initial);

        final EmailBroadcast row = record;
        final String finalHeading = heading == null || heading.isBlank()
                ? "Latest updates from " + siteName
                : heading;
        executor.submit(() -> run(mail, row, subject, finalHeading, items, recipients));

        return initial;
    }

    // ---- the background send ----

    private void run(MailService mail, EmailBroadcast row, String subject, String heading,
                     List<BroadcastRequest.Item> items, List<Subscriber> recipients) {
        int sent = 0;
        int failed = 0;
        String firstError = null;

        try {
            for (Subscriber subscriber : recipients) {
                String unsubscribeUrl = unsubscribeUrl(subscriber);
                try {
                    mail.send(subscriber.getEmail(), subject,
                            EmailContentBuilder.html(siteName, siteUrl, heading, items, unsubscribeUrl),
                            EmailContentBuilder.plainText(siteName, siteUrl, heading, items, unsubscribeUrl),
                            unsubscribeUrl);
                    sent++;
                } catch (Exception e) {
                    failed++;
                    if (firstError == null) {
                        firstError = truncate(describe(e), MAX_ERROR_LENGTH);
                    }
                    // describe() redacts the address out of the provider's
                    // message. Subscriber emails are the one piece of personal
                    // data this site holds, and log aggregators are not private.
                    log.warn("Broadcast {}: a message failed ({})", row.getId(), describe(e));
                }

                latest.set(new BroadcastStatusResponse(true, true, subject, recipients.size(),
                        sent, failed, row.getStartedAt(), null, firstError));

                if (sendDelayMs > 0) {
                    try {
                        Thread.sleep(sendDelayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        firstError = firstError == null ? "Send was interrupted." : firstError;
                        break;
                    }
                }
            }
        } catch (RuntimeException e) {
            // A failure outside the per-message try -- the loop itself, or the
            // template. Recorded rather than swallowed, or the send would look
            // like it simply stopped.
            firstError = firstError == null ? truncate(describe(e), MAX_ERROR_LENGTH) : firstError;
            log.error("Broadcast {} stopped early", row.getId(), e);
        } finally {
            Instant finishedAt = Instant.now();
            try {
                row.setSentCount(sent);
                row.setFailedCount(failed);
                row.setFinishedAt(finishedAt);
                row.setErrorMessage(firstError);
                broadcastRepository.save(row);
            } catch (RuntimeException e) {
                log.error("Could not record the result of broadcast {}", row.getId(), e);
            }
            latest.set(new BroadcastStatusResponse(true, false, subject, recipients.size(),
                    sent, failed, row.getStartedAt(), finishedAt, firstError));
            // Last, and in a finally: releasing the slot before the status is
            // written would let a new send overwrite the result of this one.
            running.set(false);
            log.info("Broadcast {} finished: {} sent, {} failed", row.getId(), sent, failed);
        }
    }

    private String unsubscribeUrl(Subscriber subscriber) {
        return siteUrl + "/unsubscribe?token="
                + URLEncoder.encode(subscriber.getUnsubscribeToken(), StandardCharsets.UTF_8);
    }

    // ---- validation ----

    private static List<BroadcastRequest.Item> cleanItems(List<BroadcastRequest.Item> raw) {
        if (raw == null || raw.isEmpty()) {
            throw new BadRequestException("Pick at least one job or result to include.");
        }
        if (raw.size() > MAX_ITEMS) {
            throw new BadRequestException(
                    "Too many items (" + raw.size() + "). Send at most " + MAX_ITEMS + " in one alert.");
        }
        List<BroadcastRequest.Item> clean = new ArrayList<>(raw.size());
        for (BroadcastRequest.Item item : raw) {
            if (item == null) continue;
            String title = requireText(item.title(), "item title", MAX_TITLE_LENGTH);
            String url = requireText(item.url(), "item link", MAX_URL_LENGTH);
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                throw new BadRequestException("Each link must start with http:// or https://");
            }
            clean.add(new BroadcastRequest.Item(title, url, optionalText(item.meta(), MAX_META_LENGTH)));
        }
        if (clean.isEmpty()) {
            throw new BadRequestException("Pick at least one job or result to include.");
        }
        return List.copyOf(clean);
    }

    private static String requireText(String value, String what, int max) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("The " + what + " is required.");
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new BadRequestException(
                    "The " + what + " is too long (" + trimmed.length() + " characters, max " + max + ").");
        }
        return trimmed;
    }

    private static String optionalText(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return null;
        return truncate(trimmed, max);
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    /**
     * A one-line reason, with the class name kept.
     *
     * Mail failures frequently carry a null or empty message, and "failed:
     * null" in the admin console has sent people looking in the wrong place
     * more than once. The exception type alone usually names the real problem
     * (AuthenticationFailedException = wrong SMTP key).
     */
    /**
     * Renders an exception for the log and for `email_broadcasts.error_message`.
     *
     * Redacted here rather than at each call site because this is the single
     * funnel both of those go through. A provider that refuses a message answers
     * with the address it refused, so the message carries one more often than not
     * -- and `error_message` is kept for the life of the row, which outlives the
     * subscriber if they later unsubscribe.
     *
     * It costs the admin the ability to see *which* address failed. That is worth
     * giving up: a send that fails for one address and not the rest is rare
     * compared with one that fails for all of them, and those failures -- bad
     * credentials, unverified sender, daily quota -- are all legible without it.
     */
    private static String describe(Exception e) {
        String message = LogSafe.redactEmails(e.getMessage());
        String type = e.getClass().getSimpleName();
        return (message == null || message.isBlank()) ? type : type + ": " + message;
    }
}
