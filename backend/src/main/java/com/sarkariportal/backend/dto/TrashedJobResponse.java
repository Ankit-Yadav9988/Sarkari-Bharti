package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One row on the admin trash screen.
 *
 * Deliberately not JobSummaryResponse. A trashed job is not a listing entry and
 * reusing the public shape for it would put deletedAt on the same record the
 * public API returns, where the field has no business existing. This carries
 * only what the trash table shows: enough to recognise the posting, plus when it
 * was trashed.
 *
 * No status: a trashed job has no public status, and computing one would invite
 * the screen to display "Active" next to a row that is not on the site.
 */
public record TrashedJobResponse(
        Long id,
        String slug,
        String postName,
        String organization,
        JobCategory category,
        LocalDate lastDate,
        Instant createdAt,
        Instant deletedAt) {

    public static TrashedJobResponse from(Job job) {
        return new TrashedJobResponse(
                job.getId(),
                Slugs.jobSlug(job.getPostName(), job.getId()),
                job.getPostName(),
                job.getOrganization(),
                job.getCategory(),
                job.getLastDate(),
                job.getCreatedAt(),
                job.getDeletedAt());
    }
}
