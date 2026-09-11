package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.ExamCalendarEntry;
import com.sarkariportal.backend.model.JobCategory;

import java.time.LocalDate;

/**
 * A calendar entry as the public API returns it.
 *
 * `tentative` is carried through deliberately. The frontend needs it to label
 * the date, and a date that is tentative in the database but unlabelled on the
 * page is worse than no date at all.
 */
public record ExamCalendarResponse(
        Long id,
        String examName,
        String organization,
        JobCategory category,
        LocalDate notificationDate,
        LocalDate applicationWindowEnd,
        LocalDate examDate,
        Integer examYear,
        boolean tentative,
        String link,
        Long jobId,
        String note,
        String officialSource) {

    public static ExamCalendarResponse from(ExamCalendarEntry entry) {
        return new ExamCalendarResponse(
                entry.getId(),
                entry.getExamName(),
                entry.getOrganization(),
                entry.getCategory(),
                entry.getNotificationDate(),
                entry.getApplicationWindowEnd(),
                entry.getExamDate(),
                entry.getExamYear(),
                entry.isTentative(),
                entry.getLink(),
                entry.getJobId(),
                entry.getNote(),
                Slugs.sourceDomain(entry.getLink()));
    }
}
