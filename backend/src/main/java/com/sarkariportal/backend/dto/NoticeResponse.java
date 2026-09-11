package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Notice;
import com.sarkariportal.backend.model.NoticeType;

import java.time.LocalDate;

/**
 * An admit card, result or answer key as the public pages consume it.
 * officialSource is derived from the link for the "Source: ssc.nic.in" label.
 */
public record NoticeResponse(
        Long id,
        NoticeType type,
        String title,
        String organization,
        JobCategory category,
        String link,
        LocalDate releaseDate,
        Long jobId,
        String jobSlug,
        String note,
        String officialSource) {

    public static NoticeResponse from(Notice notice) {
        return new NoticeResponse(
                notice.getId(),
                notice.getType(),
                notice.getTitle(),
                notice.getOrganization(),
                notice.getCategory(),
                notice.getLink(),
                notice.getReleaseDate(),
                notice.getJobId(),
                // The linked job's title is not loaded here, so the slug is just
                // the id. The route accepts a bare id, so the link still works.
                notice.getJobId() == null ? null : String.valueOf(notice.getJobId()),
                notice.getNote(),
                Slugs.sourceDomain(notice.getLink()));
    }
}
