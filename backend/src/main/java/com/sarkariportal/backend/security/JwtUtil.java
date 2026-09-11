package com.sarkariportal.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Issues and validates the admin session token.
 *
 * Two things here are security-critical and easy to get wrong:
 *
 *  1. The signing secret is validated at startup, not at first use. A weak or
 *     placeholder secret means anyone who can guess it mints their own admin
 *     token, so the application refuses to start rather than run insecurely.
 *  2. Tokens carry an explicit role claim and a fixed issuer, and both are
 *     required on the way back in. A validly-signed token is not by itself
 *     proof of admin rights.
 */
@Component
public class JwtUtil {

    /** 256 bits, the minimum for HS256. Keys.hmacShaKeyFor rejects less anyway. */
    private static final int MIN_SECRET_LENGTH = 32;

    /** Placeholders that have appeared in this repo or in common tutorials. */
    private static final Set<String> KNOWN_PLACEHOLDERS = Set.of(
            "replace-this-with-a-long-random-string-at-least-32-chars",
            "changeme",
            "change-me",
            "secret",
            "mysecret",
            "mysecretkey",
            "your-secret-key",
            "your-256-bit-secret",
            "supersecretkey"
    );

    /**
     * Substrings that mark a secret as copied from documentation rather than
     * generated. An exact-match blocklist always lags reality -- the value
     * "sarkari-portal-dev-secret-key-change-this-2026" shipped in this repo's
     * own .env.example was long enough and varied enough to pass every other
     * check here, which is precisely the hole a published template creates.
     *
     * Substring matching is safe for these specifically because every one of
     * them contains a hyphen, and a hyphen cannot occur in the output of
     * `openssl rand -base64`. A genuinely generated secret cannot trip this.
     */
    private static final Set<String> PLACEHOLDER_MARKERS = Set.of(
            "replace-this", "replace-me", "change-this", "change-me",
            "dev-secret", "test-secret", "my-secret", "your-secret",
            "not-a-secret", "sarkari-portal-dev",
            "example-", "-example", "placeholder", "insecure"
    );

    static final String ROLE_CLAIM = "role";
    static final String ADMIN_ROLE = "ADMIN";

    private final long expirationMs;
    private final String issuer;
    private final SecretKey key;

    public JwtUtil(@Value("${jwt.secret}") String secret,
                   @Value("${jwt.expiration-ms}") long expirationMs,
                   @Value("${jwt.issuer}") String issuer) {

        validateSecret(secret);
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
        this.issuer = issuer;
    }

    /**
     * Fails the application context if the configured secret is unusable.
     * Deliberately never includes the secret itself in the message.
     */
    private static void validateSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET is not set. Generate one with: openssl rand -base64 48");
        }
        if (secret.length() < MIN_SECRET_LENGTH) {
            throw new IllegalStateException(
                    "JWT_SECRET is too short (" + secret.length() + " chars, need at least "
                            + MIN_SECRET_LENGTH + "). Generate one with: openssl rand -base64 48");
        }
        String normalised = secret.trim().toLowerCase(Locale.ROOT);
        if (KNOWN_PLACEHOLDERS.contains(normalised)
                || PLACEHOLDER_MARKERS.stream().anyMatch(normalised::contains)) {
            throw new IllegalStateException(
                    "JWT_SECRET is a known placeholder value. Generate a real one with: "
                            + "openssl rand -base64 48");
        }
        // Catches "aaaaaaaa..." and similar: a random 32+ char secret has far
        // more variety than this.
        if (secret.chars().distinct().count() < 8) {
            throw new IllegalStateException(
                    "JWT_SECRET has too little variety to be random. Generate one with: "
                            + "openssl rand -base64 48");
        }
    }

    public String generateToken(String username) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .setSubject(username)
                .claim(ROLE_CLAIM, ADMIN_ROLE)
                .setIssuer(issuer)
                .setIssuedAt(now)
                .setExpiration(expiry)
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * Full validation in one step: signature, issuer, expiry, and the admin role
     * claim. Returns the subject only if every check passes, empty otherwise.
     *
     * Callers must still confirm the subject is the account they expect --
     * see JwtAuthFilter. Returning Optional rather than a boolean plus a
     * separate getter removes the window where one is checked and the other
     * used.
     */
    public Optional<String> validateAdminToken(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(key)
                    .requireIssuer(issuer)
                    // Rejects an expired token by throwing, but check it again
                    // below in case a future jjwt default changes.
                    .build()
                    .parseClaimsJws(token)
                    .getBody();

            if (claims.getExpiration() == null || !claims.getExpiration().after(new Date())) {
                return Optional.empty();
            }
            if (!ADMIN_ROLE.equals(claims.get(ROLE_CLAIM, String.class))) {
                return Optional.empty();
            }
            String subject = claims.getSubject();
            if (subject == null || subject.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(subject);

        } catch (Exception e) {
            // Malformed, wrong signature, wrong issuer, expired -- all the same
            // answer to the caller, and nothing is logged that would help an
            // attacker distinguish them.
            return Optional.empty();
        }
    }
}
