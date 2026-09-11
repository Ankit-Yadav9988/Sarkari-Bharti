package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.JobStatus;
import com.sarkariportal.backend.model.ListingSection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

/**
 * The full job, for the detail page and the admin edit form.
 *
 * Unlike {@link JobSummaryResponse} this does include the long text fields and
 * both category maps, because the detail page renders all of them. It is still a
 * record rather than the entity so the wire format is something declared here
 * rather than whatever the ORM happens to hold.
 */
public record JobDetailResponse(
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
        Integer ageMin,
        Integer ageMax,
        String eligibility,
        String selectionProcess,
        String officialApplyLink,
        String notificationPdfUrl,
        String syllabusLink,
        Map<String, Double> feeByCategory,
        Map<String, Integer> ageRelaxationByCategory,
        JobStatus status,
        Long views,
        Instant createdAt,
        Instant updatedAt,
        String officialSource) {

    public static JobDetailResponse from(Job job) {
        return new JobDetailResponse(
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
                job.getAgeMin(),
                job.getAgeMax(),
                job.getEligibility(),
                job.getSelectionProcess(),
                job.getOfficialApplyLink(),
                job.getNotificationPdfUrl(),
                job.getSyllabusLink(),
                // Sorted and never null: a HashMap iterates in an arbitrary order,
                // so the fee table on the page would otherwise reshuffle its rows
                // between requests, which also defeats any HTML caching.
                sortedOrEmpty(job.getFeeByCategory()),
                sortedOrEmpty(job.getAgeRelaxationByCategory()),
                job.getStatus(),
                job.getViews() == null ? 0L : job.getViews(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                Slugs.sourceDomain(job.getOfficialApplyLink(), job.getNotificationPdfUrl()));
    }

    private static <V> Map<String, V> sortedOrEmpty(Map<String, V> source) {
        if (source == null || source.isEmpty()) {
            return Collections.emptyMap();
        }
        return new TreeMap<>(source);
    }
}
