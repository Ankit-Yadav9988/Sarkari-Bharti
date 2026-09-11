package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.BroadcastRequest;
import com.sarkariportal.backend.dto.BroadcastStatusResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.SubscriberResponse;
import com.sarkariportal.backend.security.RateLimiter;
import com.sarkariportal.backend.service.BroadcastService;
import com.sarkariportal.backend.service.SubscriberService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Email-alert signups and the alerts themselves.
 *
 * Public: POST (the subscribe box) and the unsubscribe link. Everything else --
 * reading the list, deleting from it, and sending a broadcast -- is admin-only,
 * enforced in SecurityConfig.
 *
 * Base URL: /api/subscribers
 */
@RestController
@RequestMapping("/api/subscribers")
public class SubscriberController {

    private final SubscriberService subscriberService;
    private final BroadcastService broadcastService;
    private final RateLimiter rateLimiter;
    private final int maxAttempts;
    private final int windowSeconds;

    public SubscriberController(SubscriberService subscriberService,
                               BroadcastService broadcastService,
                               RateLimiter rateLimiter,
                               @Value("${ratelimit.subscribe.max-attempts}") int maxAttempts,
                               @Value("${ratelimit.subscribe.window-seconds}") int windowSeconds) {
        this.subscriberService = subscriberService;
        this.broadcastService = broadcastService;
        this.rateLimiter = rateLimiter;
        this.maxAttempts = maxAttempts;
        this.windowSeconds = windowSeconds;
    }

    /**
     * POST /api/subscribers  {"email": "x@y.com", "interest": "SSC"}
     *
     * Rate limited per IP, because this is an unauthenticated endpoint that
     * writes a row: without a limit, one script can fill the mailing list with
     * junk addresses, and every one of them is a row an admin has to delete by
     * hand. Three an hour is generous for a human and useless for a bot.
     *
     * The response is identical whether the address was new or already present,
     * so the endpoint cannot be used to check whether someone is subscribed.
     */
    @PostMapping
    public ResponseEntity<Map<String, String>> subscribe(@RequestBody Map<String, String> body,
                                                         HttpServletRequest request) {
        String ip = RateLimiter.clientIp(request);
        RateLimiter.Decision decision = rateLimiter.check("subscribe:" + ip, maxAttempts, windowSeconds);
        if (!decision.allowed()) {
            return ResponseEntity.status(429)
                    .header(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()))
                    .body(Map.of("error", "Too many signups from this network. Please try again later."));
        }

        subscriberService.subscribe(body.get("email"), body.get("interest"));
        return ResponseEntity.ok(Map.of("message", "Subscribed"));
    }

    /**
     * POST /api/subscribers/unsubscribe  {"token": "…"}  -- PUBLIC.
     *
     * POST rather than GET even though it arrives from a link in an email.
     * Corporate mail scanners and link-preview bots fetch every GET URL in a
     * message before the reader sees it, which with a GET unsubscribe would
     * quietly remove people who never clicked anything. The frontend page at
     * /unsubscribe reads the token from the query string and posts it.
     *
     * Always 200, even for a token that means nothing: see
     * SubscriberService.unsubscribeByToken for why.
     */
    @PostMapping("/unsubscribe")
    public ResponseEntity<Map<String, String>> unsubscribe(@RequestBody Map<String, String> body) {
        subscriberService.unsubscribeByToken(body == null ? null : body.get("token"));
        return ResponseEntity.ok(Map.of("message", "Unsubscribed"));
    }

    /** Admin: the mailing list, newest signup first. */
    @GetMapping
    public PageResponse<SubscriberResponse> getAll(
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return subscriberService.getAll(page, size);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        subscriberService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---- broadcasts (admin only) ----

    /**
     * POST /api/subscribers/broadcast -- starts mailing the list.
     *
     * Answers 202 and returns immediately; the send runs on a background
     * thread. Poll the status route below for progress. A second call while
     * one is running is refused with a 400 rather than queued.
     */
    @PostMapping("/broadcast")
    public ResponseEntity<BroadcastStatusResponse> broadcast(@RequestBody BroadcastRequest request) {
        return ResponseEntity.accepted().body(broadcastService.start(request));
    }

    /**
     * GET /api/subscribers/broadcast -- how the current or last send went.
     *
     * Also the console's way of finding out whether email is configured at all,
     * so it can show setup instructions instead of a send button that cannot
     * work.
     */
    @GetMapping("/broadcast")
    public BroadcastStatusResponse broadcastStatus() {
        return broadcastService.status();
    }
}
