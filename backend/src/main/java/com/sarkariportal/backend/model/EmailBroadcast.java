package com.sarkariportal.backend.model;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * One row = one attempt to mail the subscriber list.
 *
 * Exists so that "did the alert actually go out?" has an answer after the admin
 * closes the tab. Without it the only record of a send is a progress bar that
 * disappears on refresh, and an admin who is not sure presses send again --
 * which on a 300-a-day free quota is how a list gets mailed twice and the day's
 * allowance is spent by lunchtime.
 */
@Entity
@Table(name = "email_broadcasts")
public class EmailBroadcast {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String subject;

    /**
     * Size of the list when the send began. Deliberately separate from
     * sent + failed: someone can unsubscribe while the send is running, and
     * the two numbers not matching is information, not a bug.
     */
    @Column(name = "recipient_count", nullable = false)
    private int recipientCount;

    @Column(name = "sent_count", nullable = false)
    private int sentCount;

    @Column(name = "failed_count", nullable = false)
    private int failedCount;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt = Instant.now();

    /** Null while the send is still running. */
    @Column(name = "finished_at")
    private Instant finishedAt;

    /**
     * First failure only, truncated to fit. The rest are almost always the same
     * cause (wrong SMTP password, daily quota reached), and storing every one of
     * them would make a single misconfiguration write hundreds of identical
     * messages into one column.
     */
    @Column(name = "error_message", length = 500)
    private String errorMessage;

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }

    public int getRecipientCount() { return recipientCount; }
    public void setRecipientCount(int recipientCount) { this.recipientCount = recipientCount; }

    public int getSentCount() { return sentCount; }
    public void setSentCount(int sentCount) { this.sentCount = sentCount; }

    public int getFailedCount() { return failedCount; }
    public void setFailedCount(int failedCount) { this.failedCount = failedCount; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
