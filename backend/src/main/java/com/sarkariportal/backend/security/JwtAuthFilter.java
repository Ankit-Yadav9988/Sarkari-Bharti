package com.sarkariportal.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Turns a valid admin token into an authenticated request.
 *
 * The previous version trusted whatever subject the token carried: any
 * correctly-signed token authenticated as that name. Signature validity and
 * identity are separate questions, so the subject is now compared against the
 * single configured admin account before authentication is granted.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    private final JwtUtil jwtUtil;
    private final String adminUsername;

    public JwtAuthFilter(JwtUtil jwtUtil, @Value("${admin.username}") String adminUsername) {
        this.jwtUtil = jwtUtil;
        this.adminUsername = adminUsername;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header != null && header.startsWith(BEARER)) {
            String token = header.substring(BEARER.length()).trim();
            Optional<String> subject = jwtUtil.validateAdminToken(token);

            // Both conditions matter: the token must verify, AND its subject
            // must be the admin this deployment is configured for. A token
            // signed for some other subject is not an admin token.
            if (subject.isPresent() && adminUsername.equals(subject.get())) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                subject.get(),
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

                authentication.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else {
                // A bad token must not inherit an authentication left over from
                // anything earlier in the chain.
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }
}
