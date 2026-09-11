package com.sarkariportal.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Which frontend origins may call this API. Spring Security reads this bean
 * directly -- see SecurityConfig's http.cors(...).
 *
 * This used to be hardcoded to http://localhost:3000, which meant every API
 * call from the deployed site would be blocked by the browser the moment it
 * shipped, with a CORS error that looks like a frontend bug. It now comes from
 * CORS_ALLOWED_ORIGINS and is validated at startup.
 */
@Configuration
public class CorsConfig {

    private final List<String> allowedOrigins;

    public CorsConfig(@Value("${cors.allowed-origins}") String originsCsv) {
        this.allowedOrigins = parseAndValidate(originsCsv);
    }

    private static List<String> parseAndValidate(String originsCsv) {
        if (originsCsv == null || originsCsv.isBlank()) {
            throw new IllegalStateException(
                    "CORS_ALLOWED_ORIGINS is empty. Set it to your frontend origin, "
                            + "e.g. https://sarkari-bharti.vercel.app");
        }

        List<String> origins = Arrays.stream(originsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        if (origins.isEmpty()) {
            throw new IllegalStateException("CORS_ALLOWED_ORIGINS contained no usable origins.");
        }

        for (String origin : origins) {
            if (origin.contains("*")) {
                // A wildcard would let any site on the internet read responses
                // from this API in a visitor's browser. Nothing here needs that,
                // and it is almost always a copy-paste from a tutorial.
                throw new IllegalStateException(
                        "CORS_ALLOWED_ORIGINS must list exact origins, not wildcards. "
                                + "Offending value: " + origin);
            }
            if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
                throw new IllegalStateException(
                        "CORS origin must include the scheme, e.g. "
                                + "https://sarkari-bharti.vercel.app. "
                                + "Offending value: " + origin);
            }
            if (origin.endsWith("/")) {
                // The browser sends the Origin header without a trailing slash,
                // so "https://site.com/" silently matches nothing.
                throw new IllegalStateException(
                        "CORS origin must not end with a slash. Offending value: " + origin);
            }
        }

        return origins;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));

        // Lets the login page read how long a rate-limited caller must wait.
        config.setExposedHeaders(List.of("Retry-After"));

        // No cookies are used -- the admin token travels in the Authorization
        // header -- so the browser never needs to send ambient credentials.
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
