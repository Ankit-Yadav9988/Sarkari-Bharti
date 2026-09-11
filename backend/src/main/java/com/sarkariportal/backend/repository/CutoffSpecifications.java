package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Cutoff;
import com.sarkariportal.backend.model.JobCategory;
import org.springframework.data.jpa.domain.Specification;

/**
 * Composable WHERE clauses for the cut-off pages.
 *
 * Same reasoning as the other specification classes here: predicates built in
 * Java rather than JPQL with nullable parameters, so an absent filter
 * contributes no SQL at all and PostgreSQL is never handed a parameter whose
 * type it cannot infer.
 */
public final class CutoffSpecifications {

    private CutoffSpecifications() {
    }

    public static Specification<Cutoff> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<Cutoff> hasExamYear(Integer year) {
        if (year == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("examYear"), year);
    }

    public static Specification<Cutoff> hasState(String state) {
        if (state == null || state.isBlank()) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("state"), state.trim());
    }

    public static Specification<Cutoff> forJob(Long jobId) {
        if (jobId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("jobId"), jobId);
    }

    /**
     * Substring match on title, exam name or organisation. COALESCE on the
     * nullable columns, because LIKE against null is null rather than false and
     * would drop a row whose title matched perfectly.
     */
    public static Specification<Cutoff> matchesSearch(String search) {
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
