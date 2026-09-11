package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Notice;
import com.sarkariportal.backend.model.NoticeType;
import org.springframework.data.jpa.domain.Specification;

/**
 * Composable WHERE clauses for admit cards, results and answer keys.
 *
 * Specifications rather than JPQL with nullable parameters: a query written as
 * "(:type IS NULL OR n.type = :type)" gives PostgreSQL a bare parameter with no
 * type to infer from, and it answers "could not determine data type of
 * parameter" at runtime. Building the predicate list in Java avoids the whole
 * question -- an absent filter contributes no SQL at all.
 */
public final class NoticeSpecifications {

    private NoticeSpecifications() {
    }

    public static Specification<Notice> hasType(NoticeType type) {
        if (type == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("type"), type);
    }

    public static Specification<Notice> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    /**
     * Substring match on title or organisation.
     *
     * The Java-side version of this read every notice ever posted into memory on
     * each search, and organization is nullable, so the COALESCE matters: a null
     * in a LIKE yields null, not false, and the row would be silently skipped
     * even when its title matched.
     */
    public static Specification<Notice> matchesSearch(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String needle = Likes.contains(search);
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.<String>get("title")), needle, Likes.ESCAPE),
                cb.like(cb.lower(cb.coalesce(root.<String>get("organization"), "")),
                        needle, Likes.ESCAPE));
    }

    public static Specification<Notice> forJob(Long jobId) {
        if (jobId == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("jobId"), jobId);
    }

    @SafeVarargs
    public static Specification<Notice> combine(Specification<Notice>... specs) {
        Specification<Notice> combined = null;
        for (Specification<Notice> spec : specs) {
            if (spec == null) {
                continue;
            }
            combined = (combined == null) ? spec : combined.and(spec);
        }
        return combined;
    }
}
