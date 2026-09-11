package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.SyllabusResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Syllabus;
import com.sarkariportal.backend.repository.SyllabusRepository;
import com.sarkariportal.backend.repository.SyllabusSpecifications;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/** Exam syllabi, filtered, searched and paged in SQL. */
@Service
public class SyllabusService {

    private static final Sort NEWEST_FIRST = Sort.by(
            Sort.Order.desc("updatedDate").nullsLast(),
            Sort.Order.desc("id"));

    private final SyllabusRepository syllabusRepository;

    public SyllabusService(SyllabusRepository syllabusRepository) {
        this.syllabusRepository = syllabusRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<SyllabusResponse> getAll(JobCategory category, String search,
                                                 Long jobId, Integer page, Integer size) {
        Specification<Syllabus> spec = SyllabusSpecifications.combine(
                SyllabusSpecifications.hasCategory(category),
                SyllabusSpecifications.matchesSearch(search),
                SyllabusSpecifications.forJob(jobId));

        Page<Syllabus> found = syllabusRepository.findAll(spec, pageRequest(page, size));
        return PageResponse.from(found, found.getContent().stream()
                .map(SyllabusResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public List<SyllabusResponse> getForJob(Long jobId) {
        return syllabusRepository.findByJobIdOrderByUpdatedDateDesc(jobId).stream()
                .map(SyllabusResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public SyllabusResponse getById(Long id) {
        return SyllabusResponse.from(requireSyllabus(id));
    }

    @Transactional
    public SyllabusResponse create(Syllabus syllabus) {
        syllabus.setId(null);
        return SyllabusResponse.from(syllabusRepository.save(syllabus));
    }

    @Transactional
    public SyllabusResponse update(Long id, Syllabus updated) {
        Syllabus existing = requireSyllabus(id);
        existing.setTitle(updated.getTitle());
        existing.setExamName(updated.getExamName());
        existing.setOrganization(updated.getOrganization());
        existing.setCategory(updated.getCategory());
        existing.setLink(updated.getLink());
        existing.setUpdatedDate(updated.getUpdatedDate());
        existing.setJobId(updated.getJobId());
        existing.setNote(updated.getNote());
        return SyllabusResponse.from(syllabusRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        if (!syllabusRepository.existsById(id)) {
            throw new NoSuchElementException("Syllabus not found with id " + id);
        }
        syllabusRepository.deleteById(id);
    }

    // ---- helpers ----

    private Syllabus requireSyllabus(Long id) {
        return syllabusRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Syllabus not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? JobService.DEFAULT_PAGE_SIZE
                : Math.min(size, JobService.MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, NEWEST_FIRST);
    }
}
