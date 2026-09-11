package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.CutoffResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.Cutoff;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.service.CutoffService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Base URL: /api/cutoffs */
@RestController
@RequestMapping("/api/cutoffs")
public class CutoffController {

    private final CutoffService cutoffService;

    public CutoffController(CutoffService cutoffService) {
        this.cutoffService = cutoffService;
    }

    /**
     * GET /api/cutoffs                     -> newest exam year first
     * GET /api/cutoffs?category=SSC        -> filtered
     * GET /api/cutoffs?examYear=2025       -> one year
     * GET /api/cutoffs?state=Bihar         -> state exams
     * GET /api/cutoffs?search=cgl          -> title / exam / organisation
     * GET /api/cutoffs?page=1&size=50      -> paging, size capped at 100
     */
    @GetMapping
    public PageResponse<CutoffResponse> getAll(
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "examYear", required = false) Integer examYear,
            @RequestParam(name = "state", required = false) String state,
            @RequestParam(name = "jobId", required = false) Long jobId,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return cutoffService.getAll(category, examYear, state, search, jobId, page, size);
    }

    /**
     * GET /api/cutoffs/years -> the years that have data.
     *
     * Its own endpoint rather than a field on the list response: the year filter
     * has to offer every year even while the page is showing one of them, and
     * deriving the options from the current page would make them disappear as
     * soon as a filter was applied.
     */
    @GetMapping("/years")
    public List<Integer> getExamYears() {
        return cutoffService.getExamYears();
    }

    /** GET /api/cutoffs/for-job/5 -> every cut-off attached to one job, unpaged. */
    @GetMapping("/for-job/{jobId}")
    public List<CutoffResponse> getForJob(@PathVariable("jobId") Long jobId) {
        return cutoffService.getForJob(jobId);
    }

    @GetMapping("/{id}")
    public CutoffResponse getById(@PathVariable("id") Long id) {
        return cutoffService.getById(id);
    }

    // ---- admin only (SecurityConfig enforces it) ----

    @PostMapping
    public ResponseEntity<CutoffResponse> create(@RequestBody Cutoff cutoff) {
        return ResponseEntity.ok(cutoffService.create(cutoff));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CutoffResponse> update(@PathVariable("id") Long id,
                                                 @RequestBody Cutoff cutoff) {
        return ResponseEntity.ok(cutoffService.update(id, cutoff));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        cutoffService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
