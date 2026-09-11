package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Syllabus;

import java.time.LocalDate;

public record SyllabusResponse(
        Long id,
        String title,
        String examName,
        String organization,
        JobCategory category,
        String link,
        LocalDate updatedDate,
        Long jobId,
        String note,
        String officialSource) {

    public static SyllabusResponse from(Syllabus syllabus) {
        return new SyllabusResponse(
                syllabus.getId(),
                syllabus.getTitle(),
                syllabus.getExamName(),
                syllabus.getOrganization(),
                syllabus.getCategory(),
                syllabus.getLink(),
                syllabus.getUpdatedDate(),
                syllabus.getJobId(),
                syllabus.getNote(),
                Slugs.sourceDomain(syllabus.getLink()));
    }
}
