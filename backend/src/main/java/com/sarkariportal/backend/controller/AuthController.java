package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.LoginRequest;
import com.sarkariportal.backend.dto.LoginResponse;
import com.sarkariportal.backend.security.JwtUtil;
import com.sarkariportal.backend.security.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;

/**
 * Single-admin login. One account, configured by environment variable, checked
 * against a BCrypt hash.
 *
 * What changed and why it mattered: the password used to be a plaintext value in
 * application.properties compared with String.equals(). That is two separate
 * problems -- the credential was readable by anyone with repo or filesystem
 * access, and equals() short-circuits on the first differing character, which
 * leaks length and prefix information through response timing. Now only a hash
 * is stored, verification goes through PasswordEncoder, and the work is done
 * unconditionally so a wrong username and a wrong password take the same time.
 *
 * If this ever needs more than one admin, replace it with a users table and
 * Spring's UserDetailsService rather than adding a second set of properties.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;
    private final String adminUsername;
    private final String adminPasswordHash;
    private final int maxAttempts;
    private final int windowSeconds;

    public AuthController(JwtUtil jwtUtil,
                          PasswordEncoder passwordEncoder,
                          RateLimiter rateLimiter,
                          @Value("${admin.username}") String adminUsername,
                          @Value("${admin.password-hash}") String adminPasswordHash,
                          @Value("${ratelimit.login.max-attempts}") int maxAttempts,
                          @Value("${ratelimit.login.window-seconds}") int windowSeconds) {

        validatePasswordHash(adminPasswordHash);

        this.jwtUtil = jwtUtil;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
        this.adminUsername = adminUsername;
        this.adminPasswordHash = adminPasswordHash;
        this.maxAttempts = maxAttempts;
        this.windowSeconds = windowSeconds;
    }

    /**
     * Refuses to start if ADMIN_PASSWORD_HASH holds a plaintext password rather
     * than a hash -- the most likely misconfiguration, and one that would
     * otherwise fail silently as "wrong password" forever.
     */
    private static void validatePasswordHash(String hash) {
        if (hash == null || hash.isBlank()) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD_HASH is not set. Generate a BCrypt hash of your password "
                            + "and set it as an environment variable -- see .env.example.");
        }
        boolean looksLikeBcrypt = hash.startsWith("$2a$")
                || hash.startsWith("$2b$")
                || hash.startsWith("$2y$");
        if (!looksLikeBcrypt) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD_HASH does not look like a BCrypt hash (it should start with "
                            + "$2a$, $2b$ or $2y$). Set the hash, not the password itself.");
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest servletRequest) {

        String ip = RateLimiter.clientIp(servletRequest);
        RateLimiter.Decision decision =
                rateLimiter.check("login:" + ip, maxAttempts, windowSeconds);

        if (!decision.allowed()) {
            return ResponseEntity.status(429)
                    .header(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()))
                    .body(Map.of(
                            "error", "Too many login attempts. Try again later.",
                            "retryAfterSeconds", decision.retryAfterSeconds()));
        }

        String submittedUsername = request.getUsername() == null ? "" : request.getUsername();
        String submittedPassword = request.getPassword() == null ? "" : request.getPassword();

        // Both checks always run. Assigning to locals and combining at the end,
        // rather than && short-circuiting, keeps a wrong username from being
        // measurably faster than a wrong password.
        boolean usernameMatches = constantTimeEquals(
                adminUsername.toLowerCase(Locale.ROOT),
                submittedUsername.trim().toLowerCase(Locale.ROOT));
        boolean passwordMatches = passwordEncoder.matches(submittedPassword, adminPasswordHash);

        if (!usernameMatches || !passwordMatches) {
            // One message for both failure modes: never confirm that a username
            // exists. Also never echo the submitted username back, which would
            // reflect attacker-controlled text into the response.
            return ResponseEntity.status(401)
                    .body(Map.of("error", "Invalid username or password"));
        }

        rateLimiter.reset("login:" + ip);

        String token = jwtUtil.generateToken(adminUsername);
        return ResponseEntity.ok(new LoginResponse(token));
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8));
    }
}
