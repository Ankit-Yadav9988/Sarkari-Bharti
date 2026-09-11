package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.SubscriberResponse;
import com.sarkariportal.backend.security.RateLimiter;
import com.sarkariportal.backend.service.SubscriberService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Email-alert signups. POST is public (the subscribe box on the site); reading
 * and deleting the list is admin-only, enforced in SecurityConfig.
 *
 * Base URL: /api/subscribers
 */
@RestController
@RequestMapping("/api/subscribers")
public class SubscriberController {

    private final SubscriberService subscriberService;
    private final RateLimiter rateLimiter;
    private final int maxAttempts;
    private final int windowSeconds;

    public SubscriberController(SubscriberService subscriberService,
                               RateLimiter rateLimiter,
                               @Value("${ratelimit.subscribe.max-attempts}") int maxAttempts,
                               @Value("${ratelimit.subscribe.window-seconds}") int windowSeconds) {
        this.subscriberService = subscriberService;
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
}
