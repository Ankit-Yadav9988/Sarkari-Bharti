package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.SyllabusResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.Syllabus;
import com.sarkariportal.backend.service.SyllabusService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Base URL: /api/syllabi */
@RestController
@RequestMapping("/api/syllabi")
public class SyllabusController {

    private final SyllabusService syllabusService;

    public SyllabusController(SyllabusService syllabusService) {
        this.syllabusService = syllabusService;
    }

    /**
     * GET /api/syllabi                 -> newest first
     * GET /api/syllabi?category=SSC    -> filtered
     * GET /api/syllabi?jobId=5         -> linked to one job
     * GET /api/syllabi?search=cgl      -> site-wide search
     * GET /api/syllabi?page=1&size=50  -> paging, size capped at 100
     */
    @GetMapping
    public PageResponse<SyllabusResponse> getAll(
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "jobId", required = false) Long jobId,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return syllabusService.getAll(category, search, jobId, page, size);
    }

    /** GET /api/syllabi/for-job/5 -> every syllabus attached to one job, unpaged. */
    @GetMapping("/for-job/{jobId}")
    public List<SyllabusResponse> getForJob(@PathVariable("jobId") Long jobId) {
        return syllabusService.getForJob(jobId);
    }

    @GetMapping("/{id}")
    public SyllabusResponse getById(@PathVariable("id") Long id) {
        return syllabusService.getById(id);
    }

    // ---- admin only (SecurityConfig enforces it) ----

    @PostMapping
    public ResponseEntity<SyllabusResponse> create(@RequestBody Syllabus syllabus) {
        return ResponseEntity.ok(syllabusService.create(syllabus));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SyllabusResponse> update(@PathVariable("id") Long id,
                                                   @RequestBody Syllabus syllabus) {
        return ResponseEntity.ok(syllabusService.update(id, syllabus));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        syllabusService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
