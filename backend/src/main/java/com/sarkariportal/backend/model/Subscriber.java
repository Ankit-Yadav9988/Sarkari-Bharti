package com.sarkariportal.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

// One row = one email-alert subscriber. Collected from the "Get job alerts"
// box on the public site; the admin sends the alerts from /admin/send-alert.
@Entity
@Table(name = "subscribers", uniqueConstraints = @UniqueConstraint(columnNames = "email"))
public class Subscriber {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    // What they said they're interested in - optional, free text like "SSC".
    private String interest;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    /**
     * The secret in this subscriber's one-click unsubscribe link.
     *
     * A random UUID and not the row id: the id is sequential, so a link built
     * from it lets anyone unsubscribe anyone else just by counting. Set once at
     * construction and never updated, because a rotated token silently breaks
     * the unsubscribe link in every alert already sitting in someone's inbox.
     */
    @Column(name = "unsubscribe_token", nullable = false, length = 64, updatable = false)
    private String unsubscribeToken = newUnsubscribeToken();

    public static String newUnsubscribeToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getInterest() { return interest; }
    public void setInterest(String interest) { this.interest = interest; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getUnsubscribeToken() { return unsubscribeToken; }
    public void setUnsubscribeToken(String unsubscribeToken) { this.unsubscribeToken = unsubscribeToken; }
}
