package com.sarkariportal.backend.service;

import java.time.LocalDate;
import java.util.Locale;

/**
 * What counts as "the same posting".
 *
 * This is the one definition. The CSV importer in the browser
 * ({@code frontend/lib/csv.js}) applies the identical rule so that the row it
 * refuses to import is exactly the row this finder would have flagged. If you
 * change anything here, change {@code normaliseTitle} in that file too --
 * {@code frontend/lib/csv.js} carries a comment pointing back at this class.
 *
 * <h2>Why there are two keys, not one</h2>
 *
 * The obvious rule is "same post name". It is also wrong on its own, and the
 * codebase already knew that: {@code buildJobIndex} in csv.js refuses to resolve
 * a job by name when the name appears twice, with the note that "Combined
 * Graduate Level Exam" is the same post name in 2025 and 2026. Government
 * recruitment reuses post names every single year. A rule that treats a repeated
 * name as a duplicate would delete last year's posting, which is exactly the
 * archive a student searching for previous cut-offs came for.
 *
 * So:
 *
 * <ul>
 *   <li>{@link #looseKey} -- normalised post name plus organisation. Two rows
 *       sharing this are <i>possibly</i> the same posting. Good enough to group
 *       rows on a screen for a human to judge. Never enough to delete
 *       anything.</li>
 *   <li>{@link #strictKey} -- the loose key plus the last date. Two rows sharing
 *       this are the same notification entered twice: same post, same body, same
 *       deadline. This is what the daily pipeline produces when it re-reads a
 *       notification it already published, and it is the only key safe enough to
 *       block an import on.</li>
 * </ul>
 *
 * The 2025-vs-2026 case has different last dates, so it never collides on the
 * strict key. That is the whole point of including the date.
 *
 * <h2>Normalisation</h2>
 *
 * Lower-case, then remove spaces, underscores and hyphens. So
 * {@code "SBI Clerk (Junior Associate) 2026"} and
 * {@code "sbi clerk (junior associate) 2026"} collide, and so do
 * {@code "Sub-Inspector"} and {@code "Sub Inspector"} -- which is the realistic
 * variation between two scrapes of the same page. Punctuation is deliberately
 * kept: dropping it as well starts merging genuinely different posts.
 */
public final class DuplicateKeys {

    private DuplicateKeys() {
    }

    /** Mirrors {@code normaliseHeader} in frontend/lib/csv.js exactly. */
    public static String normalise(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_-]+", "");
    }

    /**
     * Same post, same organisation. Groups rows for review; decides nothing.
     *
     * Organisation is part of it because "Junior Engineer Recruitment 2026" is a
     * post name half the state commissions in the country publish, and grouping
     * UPPSC's with BPSC's would fill the screen with pairs that are not pairs.
     */
    public static String looseKey(String postName, String organization) {
        return normalise(postName) + '|' + normalise(organization);
    }

    /**
     * Same post, same organisation, same deadline: the same notification twice.
     *
     * A null last date is legitimate -- an Upcoming notice may be published
     * before the window is confirmed -- so it is folded into the key as a fixed
     * marker rather than making the key null. Two Upcoming notices for the same
     * post at the same body with no dates yet really are the same row entered
     * twice, which is the behaviour wanted here.
     */
    public static String strictKey(String postName, String organization, LocalDate lastDate) {
        return looseKey(postName, organization) + '|' + (lastDate == null ? "no-last-date" : lastDate);
    }
}
