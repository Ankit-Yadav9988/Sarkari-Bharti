package com.sarkariportal.backend.repository;

import org.springframework.data.jpa.domain.Specification;

/**
 * Combines Specifications while skipping the null ones.
 *
 * Every filter builder in this package returns null for "no filter applied",
 * which keeps the absent case out of the generated SQL entirely. Something then
 * has to fold the surviving predicates together, and that fold is identical
 * whatever the entity — so it lives here once, generically, rather than being
 * copied per entity.
 *
 * The Job, Notice and Syllabus specification classes each carry their own copy
 * from before this existed. They are left as they are: they work, they are
 * covered, and rewriting them would be a change with no observable effect.
 */
public final class Specs {

    private Specs() {
    }

    @SafeVarargs
    public static <T> Specification<T> combine(Specification<T>... specs) {
        Specification<T> combined = null;
        for (Specification<T> spec : specs) {
            if (spec == null) {
                continue;
            }
            combined = (combined == null) ? spec : combined.and(spec);
        }
        return combined;
    }
}
