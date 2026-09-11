package com.sarkariportal.backend.dto;

import java.time.Instant;

/**
 * Where a broadcast has got to, polled by the admin console every couple of
 * seconds while a send runs.
 *
 * `configured` is separate from `running` on purpose. A deployment with no
 * SMTP settings is the normal state before the admin has signed up with a mail
 * provider, and the console needs to say "email is not set up yet" rather than
 * offer a send button that always fails.
 */
public record BroadcastStatusResponse(
        boolean configured,
        boolean running,
        String subject,
        int total,
        int sent,
        int failed,
        Instant startedAt,
        Instant finishedAt,
        String error) {

    public static BroadcastStatusResponse notConfigured() {
        return new BroadcastStatusResponse(false, false, null, 0, 0, 0, null, null, null);
    }

    public static BroadcastStatusResponse idle() {
        return new BroadcastStatusResponse(true, false, null, 0, 0, 0, null, null, null);
    }
}
