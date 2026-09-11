package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.ExamCalendarResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.model.ExamCalendarEntry;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.service.ExamCalendarService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Base URL: /api/exam-calendar */
@RestController
@RequestMapping("/api/exam-calendar")
public class ExamCalendarController {

    private final ExamCalendarService examCalendarService;

    public ExamCalendarController(ExamCalendarService examCalendarService) {
        this.examCalendarService = examCalendarService;
    }

    /**
     * GET /api/exam-calendar                  -> soonest exam first
     * GET /api/exam-calendar?upcoming=true    -> hides exams already held
     * GET /api/exam-calendar?examYear=2026    -> one year
     * GET /api/exam-calendar?category=UPSC    -> filtered
     *
     * upcoming defaults to false. The public page passes true, but the admin
     * screens need to see and edit rows whose date has passed, and a default of
     * true would quietly hide them.
     */
    @GetMapping
    public PageResponse<ExamCalendarResponse> getAll(
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "examYear", required = false) Integer examYear,
            @RequestParam(name = "upcoming", required = false, defaultValue = "false") boolean upcoming,
            @RequestParam(name = "jobId", required = false) Long jobId,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return examCalendarService.getAll(category, examYear, upcoming, search, jobId, page, size);
    }

    /** GET /api/exam-calendar/years -> the years that have data, oldest first. */
    @GetMapping("/years")
    public List<Integer> getExamYears() {
        return examCalendarService.getExamYears();
    }

    /** GET /api/exam-calendar/for-job/5 -> calendar rows attached to one job. */
    @GetMapping("/for-job/{jobId}")
    public List<ExamCalendarResponse> getForJob(@PathVariable("jobId") Long jobId) {
        return examCalendarService.getForJob(jobId);
    }

    @GetMapping("/{id}")
    public ExamCalendarResponse getById(@PathVariable("id") Long id) {
        return examCalendarService.getById(id);
    }

    // ---- admin only (SecurityConfig enforces it) ----

    @PostMapping
    public ResponseEntity<ExamCalendarResponse> create(@RequestBody ExamCalendarEntry entry) {
        return ResponseEntity.ok(examCalendarService.create(entry));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ExamCalendarResponse> update(@PathVariable("id") Long id,
                                                      @RequestBody ExamCalendarEntry entry) {
        return ResponseEntity.ok(examCalendarService.update(id, entry));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        examCalendarService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
