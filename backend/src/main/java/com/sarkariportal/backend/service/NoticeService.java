package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.NoticeResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Notice;
import com.sarkariportal.backend.model.NoticeType;
import com.sarkariportal.backend.repository.NoticeRepository;
import com.sarkariportal.backend.repository.NoticeSpecifications;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/**
 * Admit cards, results and answer keys.
 *
 * Filtering, searching and paging all happen in SQL now. The search in
 * particular used to read the entire notices table into memory per query, which
 * is the sort of thing that works fine until the day a result is announced.
 */
@Service
public class NoticeService {

    /**
     * Newest release first, id as the tiebreaker so paging is stable when several
     * notices share a release date -- which is normal, because a commission
     * publishes a batch of them on one day.
     */
    private static final Sort NEWEST_FIRST = Sort.by(
            Sort.Order.desc("releaseDate").nullsLast(),
            Sort.Order.desc("id"));

    private final NoticeRepository noticeRepository;

    public NoticeService(NoticeRepository noticeRepository) {
        this.noticeRepository = noticeRepository;
    }

    /**
     * One entry point for the Admit Card, Result and Answer Key pages, the
     * site-wide search and the per-job block. Every argument is optional.
     */
    @Transactional(readOnly = true)
    public PageResponse<NoticeResponse> getNotices(NoticeType type, JobCategory category,
                                                  String search, Long jobId,
                                                  Integer page, Integer size) {
        Specification<Notice> spec = NoticeSpecifications.combine(
                NoticeSpecifications.hasType(type),
                NoticeSpecifications.hasCategory(category),
                NoticeSpecifications.matchesSearch(search),
                NoticeSpecifications.forJob(jobId));

        Page<Notice> found = noticeRepository.findAll(spec, pageRequest(page, size));
        return PageResponse.from(found, found.getContent().stream()
                .map(NoticeResponse::from)
                .toList());
    }

    /**
     * Notices for one job, unpaged, for the block on the job detail page. A
     * posting has a handful of these and the page shows all of them.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> getNoticesForJob(Long jobId) {
        return noticeRepository.findByJobIdOrderByReleaseDateDesc(jobId).stream()
                .map(NoticeResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public NoticeResponse getById(Long id) {
        return NoticeResponse.from(requireNotice(id));
    }

    // ---- WRITE (admin only) ----

    @Transactional
    public NoticeResponse create(Notice notice) {
        notice.setId(null);
        return NoticeResponse.from(noticeRepository.save(notice));
    }

    @Transactional
    public NoticeResponse update(Long id, Notice updated) {
        Notice existing = requireNotice(id);
        existing.setType(updated.getType());
        existing.setTitle(updated.getTitle());
        existing.setOrganization(updated.getOrganization());
        existing.setCategory(updated.getCategory());
        existing.setLink(updated.getLink());
        existing.setReleaseDate(updated.getReleaseDate());
        existing.setJobId(updated.getJobId());
        existing.setNote(updated.getNote());
        return NoticeResponse.from(noticeRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        if (!noticeRepository.existsById(id)) {
            throw new NoSuchElementException("Notice not found with id " + id);
        }
        noticeRepository.deleteById(id);
    }

    // ---- helpers ----

    private Notice requireNotice(Long id) {
        return noticeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Notice not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? JobService.DEFAULT_PAGE_SIZE
                : Math.min(size, JobService.MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, NEWEST_FIRST);
    }
}
