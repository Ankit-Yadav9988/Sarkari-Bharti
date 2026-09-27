package com.sarkariportal.backend.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Which of the submitted rows already exist on the site.
 *
 * Only the rows that matched are returned, each carrying the index it had in the
 * request so the importer can put the message on the right line. Rows that
 * matched nothing are simply absent -- an array of nulls the same length as the
 * request would be larger and no more useful.
 */
public record DuplicateCheckResponse(List<Match> matches) {

    /**
     * One collision.
     *
     * {@code exact} is the whole point of the response. An exact match is the
     * same post, the same organisation <b>and</b> the same last date: the same
     * notification arriving twice, which the importer refuses outright. A
     * non-exact match is the same post name at the same body with a different
     * deadline -- which is what last year's recruitment looks like, and is
     * therefore a warning the admin reads, not a row the importer blocks.
     *
     * {@code existingId} lets the importer link straight to the posting it
     * collided with, so "this already exists" is a sentence the admin can check
     * rather than one they have to take on trust.
     */
    public record Match(
            int index,
            Long existingId,
            String existingSlug,
            String existingPostName,
            LocalDate existingLastDate,
            boolean exact) {
    }
}
