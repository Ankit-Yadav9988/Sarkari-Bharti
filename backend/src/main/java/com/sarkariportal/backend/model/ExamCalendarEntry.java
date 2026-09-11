package com.sarkariportal.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;

/**
 * One row = one exam on the calendar.
 *
 * The three dates are the payload here, not metadata: the page exists to answer
 * "what is coming up and when do I have to act", so it is ordered by exam date
 * rather than by when the row was created.
 */
@Entity
@Table(name = "exam_calendar")
public class ExamCalendarEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String examName;        // "UPSC Civil Services Prelims"

    private String organization;

    @Enumerated(EnumType.STRING)
    private JobCategory category;

    private LocalDate notificationDate;
    private LocalDate applicationWindowEnd;
    private LocalDate examDate;
    private Integer examYear;

    /**
     * Official calendars publish "tentative" dates constantly, and a tentative
     * date presented as final is the single most damaging thing a portal like
     * this can print. Stored as a flag so the UI can label it rather than the
     * admin having to remember to write "(tentative)" in the name.
     */
    @Column(nullable = false)
    private boolean tentative = false;

    private String link;
    private Long jobId;

    @Column(columnDefinition = "TEXT")
    private String note;

    // ---- getters and setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getExamName() { return examName; }
    public void setExamName(String examName) { this.examName = examName; }

    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }

    public JobCategory getCategory() { return category; }
    public void setCategory(JobCategory category) { this.category = category; }

    public LocalDate getNotificationDate() { return notificationDate; }
    public void setNotificationDate(LocalDate notificationDate) { this.notificationDate = notificationDate; }

    public LocalDate getApplicationWindowEnd() { return applicationWindowEnd; }
    public void setApplicationWindowEnd(LocalDate applicationWindowEnd) { this.applicationWindowEnd = applicationWindowEnd; }

    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate examDate) { this.examDate = examDate; }

    public Integer getExamYear() { return examYear; }
    public void setExamYear(Integer examYear) { this.examYear = examYear; }

    public boolean isTentative() { return tentative; }
    public void setTentative(boolean tentative) { this.tentative = tentative; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
