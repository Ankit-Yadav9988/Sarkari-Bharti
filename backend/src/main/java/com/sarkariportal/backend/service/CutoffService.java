package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.CutoffResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.Cutoff;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.repository.CutoffRepository;
import com.sarkariportal.backend.repository.CutoffSpecifications;
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

/** Published cut-offs, filtered, searched and paged in SQL. */
@Service
public class CutoffService {

    /**
     * Exam year first, publication date only as a tiebreak.
     *
     * Sorting by publishedDate alone would be wrong here: a 2019 cut-off posted
     * last week would sit above this year's, which is the opposite of what
     * someone comparing years wants. nullsLast on both so a row missing a year
     * still appears, at the bottom, rather than sorting to the top as NULL does
     * by default on PostgreSQL descending sorts.
     */
    private static final Sort NEWEST_EXAM_FIRST = Sort.by(
            Sort.Order.desc("examYear").nullsLast(),
            Sort.Order.desc("publishedDate").nullsLast(),
            Sort.Order.desc("id"));

    private final CutoffRepository cutoffRepository;

    public CutoffService(CutoffRepository cutoffRepository) {
        this.cutoffRepository = cutoffRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<CutoffResponse> getAll(JobCategory category, Integer examYear, String state,
                                               String search, Long jobId, Integer page, Integer size) {
        Specification<Cutoff> spec = Specs.combine(
                CutoffSpecifications.hasCategory(category),
                CutoffSpecifications.hasExamYear(examYear),
                CutoffSpecifications.hasState(state),
                CutoffSpecifications.matchesSearch(search),
                CutoffSpecifications.forJob(jobId));

        Page<Cutoff> found = cutoffRepository.findAll(spec, pageRequest(page, size));
        return PageResponse.from(found, found.getContent().stream()
                .map(CutoffResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public List<CutoffResponse> getForJob(Long jobId) {
        return cutoffRepository.findByJobIdOrderByExamYearDesc(jobId).stream()
                .map(CutoffResponse::from)
                .toList();
    }

    /** Years with data, for the filter dropdown. */
    @Transactional(readOnly = true)
    public List<Integer> getExamYears() {
        return cutoffRepository.findDistinctExamYears();
    }

    @Transactional(readOnly = true)
    public CutoffResponse getById(Long id) {
        return CutoffResponse.from(requireCutoff(id));
    }

    @Transactional
    public CutoffResponse create(Cutoff cutoff) {
        cutoff.setId(null);
        return CutoffResponse.from(cutoffRepository.save(cutoff));
    }

    @Transactional
    public CutoffResponse update(Long id, Cutoff updated) {
        Cutoff existing = requireCutoff(id);
        existing.setTitle(updated.getTitle());
        existing.setExamName(updated.getExamName());
        existing.setOrganization(updated.getOrganization());
        existing.setCategory(updated.getCategory());
        existing.setExamYear(updated.getExamYear());
        existing.setState(updated.getState());
        existing.setLink(updated.getLink());
        existing.setMarksSummary(updated.getMarksSummary());
        existing.setPublishedDate(updated.getPublishedDate());
        existing.setJobId(updated.getJobId());
        existing.setNote(updated.getNote());
        return CutoffResponse.from(cutoffRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        if (!cutoffRepository.existsById(id)) {
            throw new NoSuchElementException("Cut-off not found with id " + id);
        }
        cutoffRepository.deleteById(id);
    }

    // ---- helpers ----

    private Cutoff requireCutoff(Long id) {
        return cutoffRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Cut-off not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? JobService.DEFAULT_PAGE_SIZE
                : Math.min(size, JobService.MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, NEWEST_EXAM_FIRST);
    }
}
