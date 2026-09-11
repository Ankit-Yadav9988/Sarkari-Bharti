package com.sarkariportal.backend.config;

import com.sarkariportal.backend.security.JwtAuthFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import java.io.IOException;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    /**
     * Cost 12 rather than the default 10. Login happens once a day for one
     * person, so the extra ~200ms is invisible here but multiplies the cost of
     * an offline attack if the hash ever leaks.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // Picks up the CorsConfigurationSource bean in CorsConfig.
            .cors(cors -> {})

            // Safe to disable: this API is stateless and authenticates from an
            // Authorization header, never a cookie. CSRF needs an ambient
            // credential the browser attaches automatically, and there isn't
            // one. If session cookies are ever introduced, turn this back on.
            .csrf(csrf -> csrf.disable())

            .sessionManagement(session ->
                    session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            .headers(headers -> headers
                    .frameOptions(frame -> frame.deny())
                    .referrerPolicy(referrer -> referrer.policy(
                            ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                    .httpStrictTransportSecurity(hsts -> hsts
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31_536_000)))

            // Unauthenticated must answer 401, not 403. The admin UI needs to
            // tell "your session expired, log in again" apart from "you are
            // logged in but not allowed to do that".
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint((request, response, authException) ->
                            writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                                    "Authentication required"))
                    .accessDeniedHandler((request, response, deniedException) ->
                            writeError(response, HttpServletResponse.SC_FORBIDDEN,
                                    "Forbidden")))

            .authorizeHttpRequests(auth -> auth
                // --- Uptime monitoring ---
                // Public and first, because the thing that checks whether the
                // site is alive must not need the site's auth to be working. It
                // returns "up" or "down" and nothing else; see HealthController.
                .requestMatchers(HttpMethod.GET, "/api/health").permitAll()

                // --- Public reads: the whole point of the site ---
                .requestMatchers(HttpMethod.GET, "/api/jobs/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/notices/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/syllabi/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/exam-calendar/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/cutoffs/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/papers/**").permitAll()

                // --- Public writes, both rate limited in their controllers ---
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/jobs/*/view").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/subscribers").permitAll()

                // Preflight. Without this, the browser's OPTIONS probe hits the
                // authenticated branch and the real request never happens.
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // --- Everything else is admin-only ---
                // hasRole, not authenticated(): the filter grants ROLE_ADMIN
                // only after confirming the token's subject is the configured
                // admin, so this is the check that actually gates writes.
                .anyRequest().hasRole("ADMIN")
            )

            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** Small JSON error body, with nothing in it that describes the internals. */
    private static void writeError(HttpServletResponse response, int status, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
