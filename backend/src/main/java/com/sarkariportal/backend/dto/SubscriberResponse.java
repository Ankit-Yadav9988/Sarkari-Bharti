package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.Subscriber;

import java.time.Instant;

/**
 * A mailing-list entry as the admin screen consumes it.
 *
 * Small but not pointless: the entity was being serialised straight out of an
 * endpoint that returns real people's email addresses, so any field added to
 * Subscriber later would have been published without anyone deciding to.
 */
public record SubscriberResponse(
        Long id,
        String email,
        String interest,
        Instant createdAt) {

    public static SubscriberResponse from(Subscriber subscriber) {
        return new SubscriberResponse(
                subscriber.getId(),
                subscriber.getEmail(),
                subscriber.getInterest(),
                subscriber.getCreatedAt());
    }
}
