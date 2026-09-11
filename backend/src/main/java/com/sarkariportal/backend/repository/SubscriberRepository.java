package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Subscriber;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SubscriberRepository extends JpaRepository<Subscriber, Long> {

    Optional<Subscriber> findByEmailIgnoreCase(String email);

    /**
     * Looks a subscriber up by the secret in their unsubscribe link.
     *
     * The only way the public unsubscribe endpoint identifies anyone. Returning
     * an Optional rather than throwing lets that endpoint answer the same way
     * for a valid token and a made-up one, so it cannot be used to test whether
     * a token exists.
     */
    Optional<Subscriber> findByUnsubscribeToken(String unsubscribeToken);
}
