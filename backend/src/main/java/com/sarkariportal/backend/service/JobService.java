package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.JobDetailResponse;
import com.sarkariportal.backend.dto.JobSummaryResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.Slugs;
import com.sarkariportal.backend.config.BadRequestException;
import com.sarkariportal.backend.model.Job;
import com.sarkariportal.backend.model.JobCategory;
import com.sarkariportal.backend.model.JobStatus;
import com.sarkariportal.backend.model.ListingSection;
import com.sarkariportal.backend.repository.JobRepository;
import com.sarkariportal.backend.repository.JobSpecifications;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

/**
 * Job reads and writes for both the public pages and the admin screens.
 *
 * Two things changed here and both were load-bearing. Filtering moved into SQL:
 * the old getJobs called findAll(), pulled the whole table into memory and
 * filtered with streams, and the homepage fires six listing queries, so one page
 * view meant six full table scans. And responses are now DTOs rather than the
 * entity, so the wire format is something declared in dto/ instead of whatever
 * the ORM happens to hold.
 */
@Service
public class JobService {

    /** Matches what the listing pages render, so page 1 needs no second query. */
    public static final int DEFAULT_PAGE_SIZE = 20;

    /** A caller asking for 10,000 rows gets 100. */
    public static final int MAX_PAGE_SIZE = 100;

    /**
     * Newest opening first, with id as a tiebreaker.
     *
     * The tiebreaker is not cosmetic: without it, two jobs sharing an
     * application start date have no defined order between them, so the same row
     * can appear on page 1 and page 2 while another never appears at all.
     */
    private static final Sort LISTING_SORT = Sort.by(
            Sort.Order.desc("applicationStartDate").nullsLast(),
            Sort.Order.desc("id"));

    /**
     * Soonest deadline first, for the homepage's "closing this week" ticker.
     *
     * That list cannot be assembled from the default order: a posting that opened
     * months ago and closes tomorrow sits far down a newest-first list, so the one
     * item the ticker most needs would be the one it never sees.
     */
    private static final Sort CLOSING_SORT = Sort.by(
            Sort.Order.asc("lastDate").nullsLast(),
            Sort.Order.asc("id"));

    /**
     * Soonest opening first, for the Upcoming page: someone planning ahead wants
     * the notification that opens next week at the top, not the one six months
     * out. This page used to sort its own rows in JavaScript, which quietly
     * stopped being correct once paging moved into SQL -- sorting a 20-row page
     * only reorders that page.
     */
    private static final Sort OPENING_SORT = Sort.by(
            Sort.Order.asc("applicationStartDate").nullsLast(),
            Sort.Order.asc("id"));

    /** The only sorts a caller may ask for by name. */
    private static final String SORT_CLOSING = "closing";
    private static final String SORT_OPENING = "opening";

    private final JobRepository jobRepository;
    private final ViewCountBuffer viewCountBuffer;

    public JobService(JobRepository jobRepository, ViewCountBuffer viewCountBuffer) {
        this.jobRepository = jobRepository;
        this.viewCountBuffer = viewCountBuffer;
    }

    // ---- READ ----

    /**
     * One entry point for every public listing page. All filters are optional
     * and combine, e.g. category=BANKING&status=ACTIVE&search=clerk.
     */
    @Transactional(readOnly = true)
    public PageResponse<JobSummaryResponse> getJobs(JobCategory category, JobStatus status,
                                                    String search, String state, String sort,
                                                    Integer page, Integer size) {
        Specification<Job> spec = JobSpecifications.combine(
                JobSpecifications.hasCategory(category),
                JobSpecifications.hasStatus(status),
                JobSpecifications.matchesSearch(search),
                JobSpecifications.hasState(state));

        Page<Job> found = jobRepository.findAll(spec, pageRequest(page, size, sortFor(sort)));

        List<JobSummaryResponse> content = found.getContent().stream()
                .map(this::withComputedStatus)
                .map(JobSummaryResponse::from)
                .toList();

        return PageResponse.from(found, content);
    }

    @Transactional(readOnly = true)
    public JobDetailResponse getJobById(Long id) {
        return JobDetailResponse.from(withComputedStatus(requireJob(id)));
    }

    /**
     * Resolves either form of the detail URL: the slugged
     * /jobs/sbi-clerk-recruitment-2026-5 and the bare /jobs/5 that was shared
     * before slugs existed. The id is the trailing number either way, so old
     * links keep working with no redirect table to maintain.
     */
    @Transactional(readOnly = true)
    public JobDetailResponse getJobByIdOrSlug(String idOrSlug) {
        Long id = Slugs.idFromSlug(idOrSlug);
        if (id == null) {
            throw new NoSuchElementException("Job not found: " + idOrSlug);
        }
        return getJobById(id);
    }

    /**
     * Counts a view from {@code viewerKey} (the caller's IP) and returns the
     * total to display.
     *
     * Nothing is written to the database here -- ViewCountBuffer accumulates and
     * flushes once a minute, and de-duplicates repeat views from the same
     * address. Returns empty for a job that does not exist so the controller can
     * answer 404 rather than counting views against a missing row.
     */
    public Optional<Long> recordView(Long id, String viewerKey) {
        return viewCountBuffer.recordView(id, viewerKey);
    }

    // ---- WRITE (admin only - SecurityConfig restricts these endpoints) ----

    @Transactional
    public JobDetailResponse createJob(Job job) {
        job.setId(null);        // a client-supplied id would overwrite a row
        validateDates(job);
        Job saved = jobRepository.save(job);
        return JobDetailResponse.from(withComputedStatus(saved));
    }

    @Transactional
    public JobDetailResponse updateJob(Long id, Job updatedJob) {
        Job existing = requireJob(id);

        validateDates(updatedJob);

        existing.setPostName(updatedJob.getPostName());
        existing.setOrganization(updatedJob.getOrganization());
        existing.setAdvertisementNo(updatedJob.getAdvertisementNo());
        existing.setCategory(updatedJob.getCategory());
        existing.setListingSection(updatedJob.getListingSection());
        existing.setState(updatedJob.getState());
        existing.setTotalPosts(updatedJob.getTotalPosts());
        existing.setApplicationStartDate(updatedJob.getApplicationStartDate());
        existing.setLastDate(updatedJob.getLastDate());
        existing.setAdmitCardDate(updatedJob.getAdmitCardDate());
        existing.setExamDate(updatedJob.getExamDate());
        existing.setResultDate(updatedJob.getResultDate());
        existing.setAgeMin(updatedJob.getAgeMin());
        existing.setAgeMax(updatedJob.getAgeMax());
        existing.setEligibility(updatedJob.getEligibility());
        existing.setSelectionProcess(updatedJob.getSelectionProcess());
        existing.setOfficialApplyLink(updatedJob.getOfficialApplyLink());
        existing.setNotificationPdfUrl(updatedJob.getNotificationPdfUrl());
        existing.setSyllabusLink(updatedJob.getSyllabusLink());
        existing.setFeeByCategory(updatedJob.getFeeByCategory());
        existing.setAgeRelaxationByCategory(updatedJob.getAgeRelaxationByCategory());
        // createdAt, views and updatedAt are deliberately not copied from the
        // request: the first two belong to the row's history and the third is
        // maintained by @PreUpdate, which is what makes the public "Updated on"
        // date trustworthy rather than whatever a client chose to send.

        return JobDetailResponse.from(withComputedStatus(jobRepository.save(existing)));
    }

    @Transactional
    public void deleteJob(Long id) {
        if (!jobRepository.existsById(id)) {
            throw new NoSuchElementException("Job not found with id " + id);
        }
        jobRepository.deleteById(id);
    }

    // ---- helpers ----

    private Job requireJob(Long id) {
        return jobRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Job not found with id " + id));
    }

    private Pageable pageRequest(Integer page, Integer size, Sort sort) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? DEFAULT_PAGE_SIZE
                : Math.min(size, MAX_PAGE_SIZE);
        return PageRequest.of(resolvedPage, resolvedSize, sort);
    }

    /**
     * Resolves the sort name to one of a few fixed orders.
     *
     * A whitelist rather than passing the value to Sort.by: a raw property name
     * from a query string lets a caller order by any column on the entity, and an
     * unknown one throws with the field name in the message, which turns the
     * mapping into a public document. An unrecognised value falls back to the
     * default instead of failing, because the parameter only decides display
     * order and a typo in a link should not blank out a page.
     */
    private static Sort sortFor(String sort) {
        String name = sort == null ? "" : sort.trim();
        if (SORT_CLOSING.equalsIgnoreCase(name)) {
            return CLOSING_SORT;
        }
        if (SORT_OPENING.equalsIgnoreCase(name)) {
            return OPENING_SORT;
        }
        return LISTING_SORT;
    }

    private Job withComputedStatus(Job job) {
        job.setStatus(computeStatus(job));
        return job;
    }

    /**
     * An Upcoming notice may be published before either application date is
     * confirmed. Once an admin places a job in AUTO or Latest, both dates are
     * required because those sections describe a live application window.
     */
    private void validateDates(Job job) {
        ListingSection section = job.getListingSection() == null
                ? ListingSection.AUTO
                : job.getListingSection();
        if (section == ListingSection.UPCOMING) {
            return;
        }
        if (job.getApplicationStartDate() == null || job.getLastDate() == null) {
            throw new BadRequestException(
                    "Application start date and last date are required outside the Upcoming section");
        }
        if (job.getLastDate().isBefore(job.getApplicationStartDate())) {
            throw new BadRequestException("Last date cannot be before application start date");
        }
    }

    /**
     * Derives the status from today's date and the job's own dates, so the admin
     * never has to remember to mark a posting closed.
     *
     * The last date is the one fact no override beats. An explicit listing
     * section says *where* a job should appear, and the admin who picks "Latest
     * jobs" is usually reaching for placement on the homepage -- they are not
     * asserting that a form which shut a year ago is still accepting
     * applications. Treating the pin as a status override made every pinned job
     * permanently ACTIVE, which is worse than useless: it points students at
     * closed forms. So once the last date has passed the job is CLOSED, pinned or
     * not, and the pin only decides placement among jobs that are still open.
     *
     * JobSpecifications.hasStatus is the SQL translation of this method. The two
     * have to move together; if this changes, that changes.
     */
    JobStatus computeStatus(Job job) {
        LocalDate today = LocalDate.now();

        // Upcoming dates are often estimates. They must not close an Upcoming
        // notice merely because an estimated date has passed.
        if (job.getListingSection() == ListingSection.UPCOMING) {
            return JobStatus.UPCOMING;
        }

        if (job.getLastDate() != null && today.isAfter(job.getLastDate())) {
            return JobStatus.CLOSED;
        }

        ListingSection section = job.getListingSection();
        if (section == ListingSection.LATEST) {
            return JobStatus.ACTIVE;
        }
        if (job.getApplicationStartDate() != null && today.isBefore(job.getApplicationStartDate())) {
            return JobStatus.UPCOMING;
        }
        if (job.getApplicationStartDate() == null) {
            return JobStatus.UPCOMING;
        }
        return JobStatus.ACTIVE;
    }
}
