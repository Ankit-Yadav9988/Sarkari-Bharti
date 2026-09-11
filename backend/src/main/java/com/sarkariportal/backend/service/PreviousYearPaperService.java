package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.PreviousYearPaperResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.PreviousYearPaper;
import com.sarkariportal.backend.repository.PreviousYearPaperRepository;
import com.sarkariportal.backend.repository.PreviousYearPaperSpecifications;
import com.sarkariportal.backend.repository.Specs;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/** Previous-year question papers, filtered, searched and paged in SQL. */
@Service
public class PreviousYearPaperService {

    /**
     * Newest year first, then by stage name so Tier 1 and Tier 2 of the same year
     * land next to each other rather than in insertion order.
     */
    private static final Sort NEWEST_EXAM_FIRST = Sort.by(
            Sort.Order.desc("examYear").nullsLast(),
            Sort.Order.asc("paperStage").nullsLast(),
            Sort.Order.desc("id"));

    private final PreviousYearPaperRepository paperRepository;

    public PreviousYearPaperService(PreviousYearPaperRepository paperRepository) {
        this.paperRepository = paperRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<PreviousYearPaperResponse> getAll(JobCategory category, Integer examYear,
                                                         String examName, String stage, String search,
                                                         Long jobId, Integer page, Integer size) {
        Specification<PreviousYearPaper> spec = Specs.combine(
                PreviousYearPaperSpecifications.hasCategory(category),
                PreviousYearPaperSpecifications.hasExamYear(examYear),
                PreviousYearPaperSpecifications.hasExamName(examName),
                PreviousYearPaperSpecifications.hasStage(stage),
                PreviousYearPaperSpecifications.matchesSearch(search),
                PreviousYearPaperSpecifications.forJob(jobId));

        Page<PreviousYearPaper> found = paperRepository.findAll(spec, pageRequest(page, size));
        return PageResponse.from(found, found.getContent().stream()
                .map(PreviousYearPaperResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public List<PreviousYearPaperResponse> getForJob(Long jobId) {
        return paperRepository.findByJobIdOrderByExamYearDesc(jobId).stream()
                .map(PreviousYearPaperResponse::from)
                .toList();
    }

    /** Years with data, for the filter dropdown. */
    @Transactional(readOnly = true)
    public List<Integer> getExamYears() {
        return paperRepository.findDistinctExamYears();
    }

    @Transactional(readOnly = true)
    public PreviousYearPaperResponse getById(Long id) {
        return PreviousYearPaperResponse.from(requirePaper(id));
    }

    @Transactional
    public PreviousYearPaperResponse create(PreviousYearPaper paper) {
        paper.setId(null);
        return PreviousYearPaperResponse.from(paperRepository.save(paper));
    }

    @Transactional
    public PreviousYearPaperResponse update(Long id, PreviousYearPaper updated) {
        PreviousYearPaper existing = requirePaper(id);
        existing.setTitle(updated.getTitle());
        existing.setExamName(updated.getExamName());
        existing.setOrganization(updated.getOrganization());
        existing.setCategory(updated.getCategory());
        existing.setExamYear(updated.getExamYear());
        existing.setPaperStage(updated.getPaperStage());
        existing.setLanguage(updated.getLanguage());
        existing.setLink(updated.getLink());
        existing.setAnswerKeyLink(updated.getAnswerKeyLink());
        existing.setHasSolution(updated.isHasSolution());
        existing.setJobId(updated.getJobId());
        existing.setNote(updated.getNote());
        return PreviousYearPaperResponse.from(paperRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        if (!paperRepository.existsById(id)) {
            throw new NoSuchElementException("Paper not found with id " + id);
        }
        paperRepository.deleteById(id);
    }

    // ---- helpers ----

    private PreviousYearPaper requirePaper(Long id) {
        return paperRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Paper not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? JobService.DEFAULT_PAGE_SIZE
                : Math.min(size, JobService.MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, NEWEST_EXAM_FIRST);
    }
}
