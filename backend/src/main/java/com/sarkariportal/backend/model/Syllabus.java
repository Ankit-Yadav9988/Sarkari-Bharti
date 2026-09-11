package com.sarkariportal.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;

// One row = one syllabus / exam pattern document.
// Shown on the public /syllabus page and linked from job detail pages.
@Entity
@Table(name = "syllabi")
public class Syllabus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;           // e.g. "SSC CGL 2026 Syllabus"

    private String examName;        // e.g. "SSC CGL"
    private String organization;    // e.g. "Staff Selection Commission"

    @Enumerated(EnumType.STRING)
    private JobCategory category;

    @Column(nullable = false)
    private String link;            // PDF or official page URL

    private LocalDate updatedDate;  // when the syllabus was last updated

    // Optional link back to a job posting on this site.
    private Long jobId;

    @Column(columnDefinition = "TEXT")
    private String note;

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getExamName() { return examName; }
    public void setExamName(String examName) { this.examName = examName; }

    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }

    public JobCategory getCategory() { return category; }
    public void setCategory(JobCategory category) { this.category = category; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public LocalDate getUpdatedDate() { return updatedDate; }
    public void setUpdatedDate(LocalDate updatedDate) { this.updatedDate = updatedDate; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
