package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.PreviousYearPaper;
import org.springframework.data.jpa.domain.Specification;

/** Composable WHERE clauses for the previous-year papers pages. */
public final class PreviousYearPaperSpecifications {

    private PreviousYearPaperSpecifications() {
    }

    public static Specification<PreviousYearPaper> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<PreviousYearPaper> hasExamYear(Integer year) {
        if (year == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("examYear"), year);
    }

    /**
     * Exam name, matched case-insensitively on the whole value.
     *
     * Backed by idx_papers_exam_name_lower, which is an index on lower(exam_name)
     * — so the lower() here is not a cost, it is what lets the index be used.
     */
    public static Specification<PreviousYearPaper> hasExamName(String examName) {
        if (examName == null || examName.isBlank()) {
            return null;
        }
        String needle = examName.trim().toLowerCase();
        return (root, query, cb) -> cb.equal(cb.lower(root.<String>get("examName")), needle);
    }

    public static Specification<PreviousYearPaper> hasStage(String stage) {
        if (stage == null || stage.isBlank()) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("paperStage"), stage.trim());
    }

    public static Specification<PreviousYearPaper> forJob(Long jobId) {
        if (jobId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("jobId"), jobId);
    }

    public static Specification<PreviousYearPaper> matchesSearch(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String needle = Likes.contains(search);
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.<String>get("title")), needle, Likes.ESCAPE),
                cb.like(cb.lower(cb.coalesce(root.<String>get("examName"), "")),
                        needle, Likes.ESCAPE),
                cb.like(cb.lower(cb.coalesce(root.<String>get("organization"), "")),
                        needle, Likes.ESCAPE));
    }
}
