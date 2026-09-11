package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.dto.JobDetailResponse;
import com.sarkariportal.backend.dto.JobSummaryResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.Slugs;
import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.JobStatus;
import com.sarkariportal.backend.security.RateLimiter;
import com.sarkariportal.backend.service.JobService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

/**
 * Base URL for everything here: /api/jobs
 *
 * The public GETs are open; POST, PUT and DELETE require an admin token, which
 * SecurityConfig enforces rather than this class.
 */
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    /**
     * GET /api/jobs                       -> first page of jobs, newest first
     * GET /api/jobs?category=BANKING      -> filtered by category
     * GET /api/jobs?status=ACTIVE         -> only open-for-application jobs
     * GET /api/jobs?search=clerk          -> keyword search on post / organisation
     * GET /api/jobs?state=Bihar           -> jobs for one state
     * GET /api/jobs?sort=closing          -> soonest last date first
     * GET /api/jobs?sort=opening          -> soonest application start first
     * GET /api/jobs?page=2&size=50        -> paging, size capped at 100
     *
     * All parameters combine. The response is always the PageResponse envelope,
     * even when a single page holds everything, so the frontend has one shape to
     * handle instead of two.
     */
    @GetMapping
    public PageResponse<JobSummaryResponse> getJobs(
            @RequestParam(name = "category", required = false) JobCategory category,
            @RequestParam(name = "status", required = false) JobStatus status,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "state", required = false) String state,
            @RequestParam(name = "sort", required = false) String sort,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size) {
        return jobService.getJobs(category, status, search, state, sort, page, size);
    }

    /**
     * GET /api/jobs/5 or /api/jobs/sbi-clerk-recruitment-2026-5
     *
     * Both resolve to the same job. The slug is decoration for search engines and
     * for anyone reading the URL; the trailing id is what is looked up.
     */
    @GetMapping("/{idOrSlug}")
    public JobDetailResponse getJob(@PathVariable("idOrSlug") String idOrSlug) {
        return jobService.getJobByIdOrSlug(idOrSlug);
    }

    /**
     * POST /api/jobs/5/view -> counts a view and returns the new total.
     *
     * Public, and fired by the detail page on load. The total comes back because
     * the page renders it immediately; nothing hits the database on this path
     * beyond the first view of each job after a restart -- ViewCountBuffer
     * accumulates in memory, de-duplicates repeat views from one address and
     * writes once a minute.
     */
    @PostMapping("/{idOrSlug}/view")
    public ResponseEntity<Map<String, Long>> recordView(
            @PathVariable("idOrSlug") String idOrSlug,
            HttpServletRequest request) {
        Long id = Slugs.idFromSlug(idOrSlug);
        if (id == null) {
            return ResponseEntity.notFound().build();
        }
        Optional<Long> views = jobService.recordView(id, RateLimiter.clientIp(request));
        return views.map(total -> ResponseEntity.ok(Map.of("views", total)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** POST /api/jobs -> create a job (admin "Add job" form). */
    @PostMapping
    public ResponseEntity<JobDetailResponse> createJob(@RequestBody Job job) {
        return ResponseEntity.ok(jobService.createJob(job));
    }

    /** PUT /api/jobs/5 -> update a job (admin "Edit" action). */
    @PutMapping("/{id}")
    public ResponseEntity<JobDetailResponse> updateJob(@PathVariable("id") Long id,
                                                       @RequestBody Job job) {
        return ResponseEntity.ok(jobService.updateJob(id, job));
    }

    /** DELETE /api/jobs/5 -> remove a job (admin "Delete" action). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteJob(@PathVariable("id") Long id) {
        jobService.deleteJob(id);
        return ResponseEntity.noContent().build();
    }
}
