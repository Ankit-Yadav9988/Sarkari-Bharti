package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.Cutoff;
import com.sarkariportal.backend.model.JobCategory;

import java.time.LocalDate;

/**
 * A cut-off as the public API returns it.
 *
 * A record rather than the entity, for the same reason as everywhere else here:
 * serialising the entity would publish whatever columns the table happens to
 * grow, and would drag a Hibernate proxy into Jackson.
 */
public record CutoffResponse(
        Long id,
        String title,
        String examName,
        String organization,
        JobCategory category,
        Integer examYear,
        String state,
        String link,
        String marksSummary,
        LocalDate publishedDate,
        Long jobId,
        String note,
        String officialSource) {

    public static CutoffResponse from(Cutoff cutoff) {
        return new CutoffResponse(
                cutoff.getId(),
                cutoff.getTitle(),
                cutoff.getExamName(),
                cutoff.getOrganization(),
                cutoff.getCategory(),
                cutoff.getExamYear(),
                cutoff.getState(),
                cutoff.getLink(),
                cutoff.getMarksSummary(),
                cutoff.getPublishedDate(),
                cutoff.getJobId(),
                cutoff.getNote(),
                Slugs.sourceDomain(cutoff.getLink()));
    }
}
