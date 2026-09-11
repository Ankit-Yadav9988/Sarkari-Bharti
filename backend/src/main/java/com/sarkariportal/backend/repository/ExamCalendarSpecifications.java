package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.ExamCalendarEntry;
import com.sarkariportal.backend.model.JobCategory;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;

/** Composable WHERE clauses for the exam calendar. */
public final class ExamCalendarSpecifications {

    private ExamCalendarSpecifications() {
    }

    public static Specification<ExamCalendarEntry> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<ExamCalendarEntry> hasExamYear(Integer year) {
        if (year == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("examYear"), year);
    }

    public static Specification<ExamCalendarEntry> forJob(Long jobId) {
        if (jobId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("jobId"), jobId);
    }

    /**
     * Only exams still to come, counting a row with no exam date as upcoming.
     *
     * That nullsInclusive choice matters: a calendar entry whose date has not
     * been announced yet is exactly what someone visiting this page wants to
     * see. Excluding it — which is what a plain greaterThanOrEqualTo does with
     * null — would hide the rows with the most anticipation behind them.
     */
    public static Specification<ExamCalendarEntry> upcomingOnly(boolean upcoming) {
        if (!upcoming) {
            return null;
        }
        LocalDate today = LocalDate.now();
        return (root, query, cb) -> cb.or(
                cb.isNull(root.get("examDate")),
                cb.greaterThanOrEqualTo(root.<LocalDate>get("examDate"), today));
    }

    public static Specification<ExamCalendarEntry> matchesSearch(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String needle = Likes.contains(search);
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.<String>get("examName")), needle, Likes.ESCAPE),
                cb.like(cb.lower(cb.coalesce(root.<String>get("organization"), "")),
                        needle, Likes.ESCAPE));
    }
}
