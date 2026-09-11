package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.JobStatus;
import com.sarkariportal.backend.model.ListingSection;

import java.time.Instant;
import java.time.LocalDate;

/**
 * What a job looks like in a list.
 *
 * Two reasons this exists rather than serialising the entity. First, the entity
 * was going out as-is, so every field added to Job became public API the moment
 * it was written -- including anything internal added later. Second, list pages
 * do not need the long text fields or the fee and age-relaxation maps, and those
 * maps are separate tables: fetching them for twenty rows meant forty extra
 * queries to render data nothing on the page displays.
 */
public record JobSummaryResponse(
        Long id,
        String slug,
        String postName,
        String organization,
        String advertisementNo,
        String state,
        JobCategory category,
        ListingSection listingSection,
        Integer totalPosts,
        LocalDate applicationStartDate,
        LocalDate lastDate,
        LocalDate admitCardDate,
        LocalDate examDate,
        LocalDate resultDate,
        String officialApplyLink,
        String notificationPdfUrl,
        JobStatus status,
        Long views,
        Instant createdAt,
        Instant updatedAt,
        String officialSource) {

    public static JobSummaryResponse from(Job job) {
        return new JobSummaryResponse(
                job.getId(),
                Slugs.jobSlug(job.getPostName(), job.getId()),
                job.getPostName(),
                job.getOrganization(),
                job.getAdvertisementNo(),
                job.getState(),
                job.getCategory(),
                job.getListingSection(),
                job.getTotalPosts(),
                job.getApplicationStartDate(),
                job.getLastDate(),
                job.getAdmitCardDate(),
                job.getExamDate(),
                job.getResultDate(),
                job.getOfficialApplyLink(),
                job.getNotificationPdfUrl(),
                job.getStatus(),
                job.getViews() == null ? 0L : job.getViews(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                Slugs.sourceDomain(job.getOfficialApplyLink(), job.getNotificationPdfUrl()));
    }
}
