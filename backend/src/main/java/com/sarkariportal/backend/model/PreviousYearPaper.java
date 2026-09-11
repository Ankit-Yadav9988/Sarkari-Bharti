package com.sarkariportal.backend.model;

import jakarta.persistence.*;

/**
 * One row = one previous-year question paper.
 *
 * The link is non-null because a paper row without a paper is not a partial
 * record, it is a dead end: the entire reason someone opens this page is to
 * download the PDF.
 */
@Entity
@Table(name = "previous_year_papers")
public class PreviousYearPaper {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;           // "SSC CGL 2024 Tier-1 Question Paper (Shift 2)"

    private String examName;
    private String organization;

    @Enumerated(EnumType.STRING)
    private JobCategory category;

    private Integer examYear;
    private String paperStage;      // "Tier 1", "Prelims", "Mains"
    private String language;        // "English", "Hindi", "Bilingual"

    @Column(nullable = false)
    private String link;

    private String answerKeyLink;

    @Column(nullable = false)
    private boolean hasSolution = false;

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

    public String getPaperStage() { return paperStage; }
    public void setPaperStage(String paperStage) { this.paperStage = paperStage; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public String getAnswerKeyLink() { return answerKeyLink; }
    public void setAnswerKeyLink(String answerKeyLink) { this.answerKeyLink = answerKeyLink; }

    public boolean isHasSolution() { return hasSolution; }
    public void setHasSolution(boolean hasSolution) { this.hasSolution = hasSolution; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
