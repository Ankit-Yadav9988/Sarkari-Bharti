package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.NoticeResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Notice;
import com.sarkariportal.backend.model.NoticeType;
import com.sarkariportal.backend.service.NoticeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Admit cards, results and answer keys - posted separately from jobs, because
 * the admin often needs to publish a result for something that was never listed
 * here as a vacancy.
 *
 * Base URL: /api/notices
 */
@RestController
@RequestMapping("/api/notices")
public class NoticeController {

    private final NoticeService noticeService;

    public NoticeController(NoticeService noticeService) {
        this.noticeService = noticeService;
    }

    /**
     * GET /api/notices?type=ADMIT_CARD   -> the Admit Card page
     * GET /api/notices?type=RESULT       -> the Result page
     * GET /api/notices?category=RAILWAY  -> narrowed to one sector
     * GET /api/notices?search=ssc        -> site-wide search
     * GET /api/notices?page=1&size=50    -> paging, size capped at 100
     *
     * Filters combine. jobId is handled by the dedicated route below so the
     * detail page gets an unpaged list.
     */
    @GetMapping
    public PageResponse<NoticeResponse> getNotices(
            @RequestParam(name = "type", required = false) NoticeType type,
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "jobId", required = false) Long jobId,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return noticeService.getNotices(type, category, search, jobId, page, size);
    }

    /** GET /api/notices/for-job/5 -> every notice attached to one job, unpaged. */
    @GetMapping("/for-job/{jobId}")
    public List<NoticeResponse> getForJob(@PathVariable("jobId") Long jobId) {
        return noticeService.getNoticesForJob(jobId);
    }

    @GetMapping("/{id}")
    public NoticeResponse getById(@PathVariable("id") Long id) {
        return noticeService.getById(id);
    }

    // ---- admin only (SecurityConfig enforces it) ----

    @PostMapping
    public ResponseEntity<NoticeResponse> create(@RequestBody Notice notice) {
        return ResponseEntity.ok(noticeService.create(notice));
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoticeResponse> update(@PathVariable("id") Long id,
                                                 @RequestBody Notice notice) {
        return ResponseEntity.ok(noticeService.update(id, notice));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        noticeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
