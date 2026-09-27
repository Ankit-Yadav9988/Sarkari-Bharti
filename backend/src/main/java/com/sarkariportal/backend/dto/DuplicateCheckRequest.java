package com.sarkariportal.backend.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Asks the server which of these rows already exist, before they are imported.
 *
 * The CSV importer runs in the browser and cannot see the database, which is why
 * it could only ever catch duplicates <i>inside one file</i>. This is the
 * missing half: the importer sends the identifying fields of every row it is
 * about to publish and gets back the ones that collide with a live posting.
 *
 * <p>Sending candidates up rather than pulling every job down is deliberate.
 * The alternative -- a "give me the key of every job" endpoint -- grows with the
 * table and would ship the whole catalogue to the browser to import forty rows.
 * This request is proportional to the file being imported.
 *
 * <p>Nothing here identifies a person and nothing is written, so this is a POST
 * only because it carries a body.
 */
public record DuplicateCheckRequest(List<Candidate> rows) {

    /**
     * The three fields that decide sameness. See
     * {@link com.sarkariportal.backend.service.DuplicateKeys}: post name and
     * organisation make a row <i>possibly</i> a duplicate, and the last date is
     * what promotes it to certainly one.
     */
    public record Candidate(String postName, String organization, LocalDate lastDate) {
    }
}
