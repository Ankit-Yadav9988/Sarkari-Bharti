package com.sarkariportal.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

// One row = one email-alert subscriber. Collected from the "Get job alerts"
// box on the public site; the admin reads the list and mails updates
// (manually for now, or via a mail provider later).
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

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getInterest() { return interest; }
    public void setInterest(String interest) { this.interest = interest; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
