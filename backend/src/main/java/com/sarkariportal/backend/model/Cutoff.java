package com.sarkariportal.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;

/**
 * One row = one published cut-off.
 *
 * These are evergreen in a way a job notification is not: a 2023 cut-off keeps
 * answering "what marks do I need" for years, while a closed application stops
 * earning traffic the day it closes. That is why the table exists separately
 * rather than as a field on Job.
 */
@Entity
@Table(name = "cutoffs")
public class Cutoff {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;           // "SSC CGL 2025 Tier-1 Cut Off"

    private String examName;        // "SSC CGL"
    private String organization;

    @Enumerated(EnumType.STRING)
    private JobCategory category;

    private Integer examYear;       // the sort and filter key: cut-offs are read year over year
    private String state;
    private String link;            // official PDF, optional -- the marks may be typed in instead

    /**
     * Category-wise marks as free text: "GEN 148.2 / OBC 142.6 / SC 129.4".
     *
     * Deliberately unstructured. The category list differs by exam, by state and
     * by year, and a rigid schema would stop the admin posting a cut-off whose
     * shape it did not anticipate -- which for the highest-traffic page type on
     * the site is the wrong failure to design in.
     */
    @Column(name = "marks_summary", columnDefinition = "TEXT")
    private String marksSummary;

    private LocalDate publishedDate;

    // Optional back reference to a job on this site. Not a foreign key: the
    // admin routinely posts a cut-off for an exam that was never listed here.
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

    public Integer getExamYear() { return examYear; }
    public void setExamYear(Integer examYear) { this.examYear = examYear; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public String getMarksSummary() { return marksSummary; }
    public void setMarksSummary(String marksSummary) { this.marksSummary = marksSummary; }

    public LocalDate getPublishedDate() { return publishedDate; }
    public void setPublishedDate(LocalDate publishedDate) { this.publishedDate = publishedDate; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
