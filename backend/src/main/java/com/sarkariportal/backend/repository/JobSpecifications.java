package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.JobStatus;
import com.sarkariportal.backend.model.ListingSection;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.Locale;

/**
 * Composable WHERE clauses for the job listing queries.
 *
 * This exists to move filtering out of Java and into SQL. The previous
 * implementation called findAll(), streamed the entire table into memory and
 * filtered there, and the homepage issues six listing queries -- so a single
 * page view meant six full table scans plus six full result sets over the
 * wire. That is survivable at a few hundred rows and not at tens of thousands,
 * which is where a portal covering every state board ends up.
 *
 * The interesting part is {@link #hasStatus}: status is a @Transient field
 * computed from dates, so it cannot be compared directly in SQL. Each status is
 * instead expressed as the date and listing-section conditions that produce it,
 * mirroring JobService.computeStatus() exactly. If one changes, the other has
 * to change with it -- JobServiceTest pins them together.
 */
public final class JobSpecifications {

    private JobSpecifications() {
    }

    public static Specification<Job> hasCategory(JobCategory category) {
        if (category == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    /** Exact, case-insensitive state match. Null state means central/all-India. */
    public static Specification<Job> hasState(String state) {
        if (state == null || state.isBlank()) {
            return null;
        }
        String needle = state.trim().toLowerCase(Locale.ROOT);
        return (root, query, cb) -> cb.equal(cb.lower(root.<String>get("state")), needle);
    }

    /**
     * Substring match on post name or organisation. Uses lower(...) LIKE so it
     * can use the expression indexes from V2 for anchored searches; a leading
     * wildcard still scans, which is an acceptable trade for a search box that
     * has to find "clerk" inside "SBI Clerk recruitment".
     */
    public static Specification<Job> matchesSearch(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String needle = Likes.contains(search);
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.<String>get("postName")), needle, Likes.ESCAPE),
                cb.like(cb.lower(root.<String>get("organization")), needle, Likes.ESCAPE));
    }

    /**
     * Translates a computed status into the conditions that produce it.
     *
     * An explicit listing section always wins over the dates, so each status is
     * "forced into this section" OR "left on AUTO and the dates say so".
     */
    public static Specification<Job> hasStatus(JobStatus status) {
        if (status == null) {
            return null;
        }
        LocalDate today = LocalDate.now();

        return (root, query, cb) -> {
            // listingSection is nullable: rows written before the column existed
            // have null, which JobService treats identically to AUTO.
            Predicate onAuto = cb.or(
                    cb.isNull(root.get("listingSection")),
                    cb.equal(root.get("listingSection"), ListingSection.AUTO));

            switch (status) {
                case ACTIVE:
                    return cb.or(
                            cb.equal(root.get("listingSection"), ListingSection.LATEST),
                            cb.and(onAuto,
                                    cb.lessThanOrEqualTo(root.get("applicationStartDate"), today),
                                    cb.greaterThanOrEqualTo(root.get("lastDate"), today)));

                case UPCOMING:
                    return cb.or(
                            cb.equal(root.get("listingSection"), ListingSection.UPCOMING),
                            cb.and(onAuto,
                                    cb.greaterThan(root.get("applicationStartDate"), today)));

                case CLOSED:
                    // A job the admin pinned to LATEST or UPCOMING is never
                    // reported closed, however old its dates are.
                    return cb.and(onAuto, cb.lessThan(root.get("lastDate"), today));

                default:
                    return cb.conjunction();
            }
        };
    }

    /** Combines the non-null specifications with AND. */
    @SafeVarargs
    public static Specification<Job> combine(Specification<Job>... specs) {
        Specification<Job> combined = null;
        for (Specification<Job> spec : specs) {
            if (spec == null) {
                continue;
            }
            combined = (combined == null) ? spec : combined.and(spec);
        }
        return combined;
    }
}
