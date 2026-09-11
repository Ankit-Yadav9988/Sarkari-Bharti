package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.PreviousYearPaperResponse;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.PreviousYearPaper;
import com.sarkariportal.backend.service.PreviousYearPaperService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Base URL: /api/papers */
@RestController
@RequestMapping("/api/papers")
public class PreviousYearPaperController {

    private final PreviousYearPaperService paperService;

    public PreviousYearPaperController(PreviousYearPaperService paperService) {
        this.paperService = paperService;
    }

    /**
     * GET /api/papers                      -> newest exam year first
     * GET /api/papers?examName=SSC CGL     -> every year of one exam, the way
     *                                         people actually revise
     * GET /api/papers?examYear=2024&stage=Tier 1
     * GET /api/papers?search=cgl           -> title / exam / organisation
     */
    @GetMapping
    public PageResponse<PreviousYearPaperResponse> getAll(
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "examYear", required = false) Integer examYear,
            @RequestParam(name = "examName", required = false) String examName,
            @RequestParam(name = "stage", required = false) String stage,
            @RequestParam(name = "jobId", required = false) Long jobId,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return paperService.getAll(category, examYear, examName, stage, search, jobId, page, size);
    }

    /** GET /api/papers/years -> the years that have papers. */
    @GetMapping("/years")
    public List<Integer> getExamYears() {
        return paperService.getExamYears();
    }

    /** GET /api/papers/for-job/5 -> every paper attached to one job, unpaged. */
    @GetMapping("/for-job/{jobId}")
    public List<PreviousYearPaperResponse> getForJob(@PathVariable("jobId") Long jobId) {
        return paperService.getForJob(jobId);
    }

    @GetMapping("/{id}")
    public PreviousYearPaperResponse getById(@PathVariable("id") Long id) {
        return paperService.getById(id);
    }

    // ---- admin only (SecurityConfig enforces it) ----

    @PostMapping
    public ResponseEntity<PreviousYearPaperResponse> create(@RequestBody PreviousYearPaper paper) {
        return ResponseEntity.ok(paperService.create(paper));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PreviousYearPaperResponse> update(@PathVariable("id") Long id,
                                                          @RequestBody PreviousYearPaper paper) {
        return ResponseEntity.ok(paperService.update(id, paper));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        paperService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
