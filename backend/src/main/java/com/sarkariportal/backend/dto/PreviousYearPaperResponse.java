package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.PreviousYearPaper;

/**
 * A previous-year paper as the public API returns it.
 *
 * officialSource falls back from the paper link to the answer-key link. Both are
 * passed because the paper is occasionally hosted on a mirror while the answer
 * key sits on the board's own site, and in that case the board's domain is the
 * one worth showing.
 */
public record PreviousYearPaperResponse(
        Long id,
        String title,
        String examName,
        String organization,
        JobCategory category,
        Integer examYear,
        String paperStage,
        String language,
        String link,
        String answerKeyLink,
        boolean hasSolution,
        Long jobId,
        String note,
        String officialSource) {

    public static PreviousYearPaperResponse from(PreviousYearPaper paper) {
        return new PreviousYearPaperResponse(
                paper.getId(),
                paper.getTitle(),
                paper.getExamName(),
                paper.getOrganization(),
                paper.getCategory(),
                paper.getExamYear(),
                paper.getPaperStage(),
                paper.getLanguage(),
                paper.getLink(),
                paper.getAnswerKeyLink(),
                paper.isHasSolution(),
                paper.getJobId(),
                paper.getNote(),
                Slugs.sourceDomain(paper.getLink(), paper.getAnswerKeyLink()));
    }
}
