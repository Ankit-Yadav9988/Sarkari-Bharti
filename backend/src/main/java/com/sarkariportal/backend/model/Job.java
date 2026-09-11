package com.sarkariportal.backend.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

// One row in this table = one job posting shown on the site
// (e.g. "SBI Clerk recruitment 2026").
@Entity
@Table(name = "jobs")
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String postName;              // e.g. "SBI Clerk (Junior Associate) recruitment 2026"

    @Column(nullable = false)
    private String organization;          // e.g. "State Bank of India"

    private String advertisementNo;       // official reference number, e.g. CRPD/CR/2026-27/12

    // State/UT this job belongs to. Null = central/all-India.
    // e.g. "Uttar Pradesh", "Bihar", "Rajasthan"
    private String state;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobCategory category;

    // Which public section this job is listed in. AUTO (default) decides from
    // the dates; the admin can override to LATEST or UPCOMING from the form.
    // Nullable so the column can be added to a database that already has jobs -
    // null is treated exactly like AUTO in JobService.computeStatus().
    @Enumerated(EnumType.STRING)
    private ListingSection listingSection = ListingSection.AUTO;

    private Integer totalPosts;

    @Column(nullable = false)
    private LocalDate applicationStartDate;

    @Column(nullable = false)
    private LocalDate lastDate;

    private LocalDate admitCardDate;
    private LocalDate examDate;
    private LocalDate resultDate;

    private Integer ageMin;
    private Integer ageMax;

    @Column(columnDefinition = "TEXT")
    private String eligibility;

    @Column(columnDefinition = "TEXT")
    private String selectionProcess;

    private String officialApplyLink;
    private String notificationPdfUrl;
    private String syllabusLink;

    // Category-wise fee, e.g. { "GENERAL": 750.0, "SC_ST": 0.0 }
    @ElementCollection
    @CollectionTable(name = "job_fees", joinColumns = @JoinColumn(name = "job_id"))
    @MapKeyColumn(name = "category_name")
    @Column(name = "amount")
    private Map<String, Double> feeByCategory = new HashMap<>();

    // Category-wise age relaxation in years, e.g. { "OBC": 3, "SC_ST": 5, "PWBD": 10 }
    @ElementCollection
    @CollectionTable(name = "job_age_relaxation", joinColumns = @JoinColumn(name = "job_id"))
    @MapKeyColumn(name = "category_name")
    @Column(name = "extra_years")
    private Map<String, Integer> ageRelaxationByCategory = new HashMap<>();

    // When the job was posted on THIS site (not the official notification date).
    // Used by the frontend to show a "New" badge for the first 48 hours.
    // Nullable so the column can be added to a database that already has jobs.
    @Column(updatable = false)
    private Instant createdAt;

    // When any field was last edited. Shown on the public page as
    // "Updated 3 Sep 2026" -- on a site full of stale scrapers, a visible and
    // honest freshness date is a trust signal, so it is maintained
    // automatically rather than being something the admin has to remember.
    private Instant updatedAt;

    // How many times the job detail page has been opened. Incremented via
    // POST /api/jobs/{id}/view - shown as social proof ("2.3k views").
    private Long views = 0L;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = createdAt;
        if (views == null) views = 0L;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    // Status is NOT stored — it's computed live from the dates above.
    // See JobService.computeStatus()
    @Transient
    private JobStatus status;

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPostName() { return postName; }
    public void setPostName(String postName) { this.postName = postName; }

    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }

    public String getAdvertisementNo() { return advertisementNo; }
    public void setAdvertisementNo(String advertisementNo) { this.advertisementNo = advertisementNo; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public JobCategory getCategory() { return category; }
    public void setCategory(JobCategory category) { this.category = category; }

    public Integer getTotalPosts() { return totalPosts; }
    public void setTotalPosts(Integer totalPosts) { this.totalPosts = totalPosts; }

    public LocalDate getApplicationStartDate() { return applicationStartDate; }
    public void setApplicationStartDate(LocalDate applicationStartDate) { this.applicationStartDate = applicationStartDate; }

    public LocalDate getLastDate() { return lastDate; }
    public void setLastDate(LocalDate lastDate) { this.lastDate = lastDate; }

    public LocalDate getAdmitCardDate() { return admitCardDate; }
    public void setAdmitCardDate(LocalDate admitCardDate) { this.admitCardDate = admitCardDate; }

    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate examDate) { this.examDate = examDate; }

    public LocalDate getResultDate() { return resultDate; }
    public void setResultDate(LocalDate resultDate) { this.resultDate = resultDate; }

    public Integer getAgeMin() { return ageMin; }
    public void setAgeMin(Integer ageMin) { this.ageMin = ageMin; }

    public Integer getAgeMax() { return ageMax; }
    public void setAgeMax(Integer ageMax) { this.ageMax = ageMax; }

    public String getEligibility() { return eligibility; }
    public void setEligibility(String eligibility) { this.eligibility = eligibility; }

    public String getSelectionProcess() { return selectionProcess; }
    public void setSelectionProcess(String selectionProcess) { this.selectionProcess = selectionProcess; }

    public String getOfficialApplyLink() { return officialApplyLink; }
    public void setOfficialApplyLink(String officialApplyLink) { this.officialApplyLink = officialApplyLink; }

    public String getNotificationPdfUrl() { return notificationPdfUrl; }
    public void setNotificationPdfUrl(String notificationPdfUrl) { this.notificationPdfUrl = notificationPdfUrl; }

    public String getSyllabusLink() { return syllabusLink; }
    public void setSyllabusLink(String syllabusLink) { this.syllabusLink = syllabusLink; }

    public ListingSection getListingSection() { return listingSection; }
    public void setListingSection(ListingSection listingSection) { this.listingSection = listingSection; }

    public Map<String, Double> getFeeByCategory() { return feeByCategory; }
    public void setFeeByCategory(Map<String, Double> feeByCategory) { this.feeByCategory = feeByCategory; }

    public Map<String, Integer> getAgeRelaxationByCategory() { return ageRelaxationByCategory; }
    public void setAgeRelaxationByCategory(Map<String, Integer> ageRelaxationByCategory) { this.ageRelaxationByCategory = ageRelaxationByCategory; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Long getViews() { return views; }
    public void setViews(Long views) { this.views = views; }

    public JobStatus getStatus() { return status; }
    public void setStatus(JobStatus status) { this.status = status; }
}
