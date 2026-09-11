package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.ExamCalendarResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.ExamCalendarEntry;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.repository.ExamCalendarRepository;
import com.sarkariportal.backend.repository.ExamCalendarSpecifications;
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

/** The exam calendar, filtered and paged in SQL. */
@Service
public class ExamCalendarService {

    /**
     * Soonest exam first -- ascending, unlike every other listing on this site.
     *
     * The others are archives and read newest-first. A calendar answers "what is
     * next", so the row at the top has to be the nearest date, not the latest
     * one added.
     *
     * nullsLast may look like it contradicts upcomingOnly(), which deliberately
     * counts an undated row as upcoming. It does not: that predicate exists so an
     * unannounced date is not *hidden*, and this ordering puts it where an
     * unknown date belongs relative to known ones -- after them.
     */
    private static final Sort SOONEST_FIRST = Sort.by(
            Sort.Order.asc("examDate").nullsLast(),
            Sort.Order.asc("examName"),
            Sort.Order.asc("id"));

    private final ExamCalendarRepository examCalendarRepository;

    public ExamCalendarService(ExamCalendarRepository examCalendarRepository) {
        this.examCalendarRepository = examCalendarRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<ExamCalendarResponse> getAll(JobCategory category, Integer examYear,
                                                    boolean upcoming, String search, Long jobId,
                                                    Integer page, Integer size) {
        Specification<ExamCalendarEntry> spec = Specs.combine(
                ExamCalendarSpecifications.hasCategory(category),
                ExamCalendarSpecifications.hasExamYear(examYear),
                ExamCalendarSpecifications.upcomingOnly(upcoming),
                ExamCalendarSpecifications.matchesSearch(search),
                ExamCalendarSpecifications.forJob(jobId));

        Page<ExamCalendarEntry> found = examCalendarRepository.findAll(spec, pageRequest(page, size));
        return PageResponse.from(found, found.getContent().stream()
                .map(ExamCalendarResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public List<ExamCalendarResponse> getForJob(Long jobId) {
        return examCalendarRepository.findByJobIdOrderByExamDateAsc(jobId).stream()
                .map(ExamCalendarResponse::from)
                .toList();
    }

    /** Years with data, for the filter dropdown. */
    @Transactional(readOnly = true)
    public List<Integer> getExamYears() {
        return examCalendarRepository.findDistinctExamYears();
    }

    @Transactional(readOnly = true)
    public ExamCalendarResponse getById(Long id) {
        return ExamCalendarResponse.from(requireEntry(id));
    }

    @Transactional
    public ExamCalendarResponse create(ExamCalendarEntry entry) {
        entry.setId(null);
        return ExamCalendarResponse.from(examCalendarRepository.save(entry));
    }

    @Transactional
    public ExamCalendarResponse update(Long id, ExamCalendarEntry updated) {
        ExamCalendarEntry existing = requireEntry(id);
        existing.setExamName(updated.getExamName());
        existing.setOrganization(updated.getOrganization());
        existing.setCategory(updated.getCategory());
        existing.setNotificationDate(updated.getNotificationDate());
        existing.setApplicationWindowEnd(updated.getApplicationWindowEnd());
        existing.setExamDate(updated.getExamDate());
        existing.setExamYear(updated.getExamYear());
        existing.setTentative(updated.isTentative());
        existing.setLink(updated.getLink());
        existing.setJobId(updated.getJobId());
        existing.setNote(updated.getNote());
        return ExamCalendarResponse.from(examCalendarRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        if (!examCalendarRepository.existsById(id)) {
            throw new NoSuchElementException("Calendar entry not found with id " + id);
        }
        examCalendarRepository.deleteById(id);
    }

    // ---- helpers ----

    private ExamCalendarEntry requireEntry(Long id) {
        return examCalendarRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Calendar entry not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? JobService.DEFAULT_PAGE_SIZE
                : Math.min(size, JobService.MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, SOONEST_FIRST);
    }
}
