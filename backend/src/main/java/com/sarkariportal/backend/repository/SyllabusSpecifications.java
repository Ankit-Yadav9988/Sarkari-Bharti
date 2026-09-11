package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Syllabus;
import org.springframework.data.jpa.domain.Specification;

/**
 * Composable WHERE clauses for the syllabus pages. Same reasoning as
 * {@link NoticeSpecifications}: predicates built in Java rather than JPQL with
 * nullable parameters, so an absent filter contributes no SQL and PostgreSQL is
 * never handed a parameter it cannot type.
 */
public final class SyllabusSpecifications {

    private SyllabusSpecifications() {
    }

    public static Specification<Syllabus> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<Syllabus> forJob(Long jobId) {
        if (jobId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("jobId"), jobId);
    }

    /**
     * Substring match on title, exam name or organisation. COALESCE on the two
     * nullable columns, because LIKE against null is null rather than false and
     * would drop a row whose title matched perfectly.
     */
    public static Specification<Syllabus> matchesSearch(String search) {
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

    @SafeVarargs
    public static Specification<Syllabus> combine(Specification<Syllabus>... specs) {
        Specification<Syllabus> combined = null;
        for (Specification<Syllabus> spec : specs) {
            if (spec == null) {
                continue;
            }
            combined = (combined == null) ? spec : combined.and(spec);
        }
        return combined;
    }
}
