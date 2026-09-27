package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.service.JobService;

/**
 * Result of a bulk trash / restore / purge.
 *
 * {@code skipped} is spelled out as its own field rather than left as a derived
 * accessor on JobService.BulkResult. Jackson's handling of extra non-component
 * methods on a record is not something to rely on for a number the admin screen
 * prints, so the wire shape is declared here in full.
 *
 * A non-zero {@code skipped} is not an error. It means some of the ids were
 * already in the state being asked for -- two browser tabs, a double-clicked
 * button, or an id that has since been purged.
 */
public record BulkActionResponse(int requested, int changed, int skipped) {

    public static BulkActionResponse from(JobService.BulkResult result) {
        return new BulkActionResponse(result.requested(), result.changed(), result.skipped());
    }
}
