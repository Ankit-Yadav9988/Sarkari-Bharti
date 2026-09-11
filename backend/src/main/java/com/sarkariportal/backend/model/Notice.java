package com.sarkariportal.backend.model;

import jakarta.persistence.*;

import java.time.LocalDate;

// One row = one admit card / result / answer key post, shown on the
// Admit Card or Result page. It can optionally point back to a Job (jobId),
// but it doesn't have to - the admin can post a result for something that
// was never listed as a job here.
@Entity
@Table(name = "notices")
public class Notice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NoticeType type;

    @Column(nullable = false)
    private String title;                 // e.g. "SSC CGL 2026 Tier-1 Admit Card"

    private String organization;          // e.g. "Staff Selection Commission"

    @Enumerated(EnumType.STRING)
    private JobCategory category;

    @Column(nullable = false)
    private String link;                  // the download / view URL

    private LocalDate releaseDate;        // when it was actually released

    // Optional link back to a job posting on this site (so the public page can
    // show a "view job" link). Null if it's a standalone post.
    private Long jobId;

    @Column(columnDefinition = "TEXT")
    private String note;                  // any extra instruction, optional

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public NoticeType getType() { return type; }
    public void setType(NoticeType type) { this.type = type; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }

    public JobCategory getCategory() { return category; }
    public void setCategory(JobCategory category) { this.category = category; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public LocalDate getReleaseDate() { return releaseDate; }
    public void setReleaseDate(LocalDate releaseDate) { this.releaseDate = releaseDate; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
