package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.DuplicateCheckRequest;
import com.sarkariportal.backend.dto.DuplicateCheckResponse;
import com.sarkariportal.backend.dto.DuplicateGroupResponse;
import com.sarkariportal.backend.dto.JobDetailResponse;
import com.sarkariportal.backend.dto.JobSummaryResponse;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.Slugs;
import com.sarkariportal.backend.dto.TrashedJobResponse;
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

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
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
 *
 * <p><b>Deleting is recoverable.</b> Since V7, "delete" stamps deleted_at and
 * nothing more; the row survives and can be restored. That puts one obligation
 * on every read in this class: it must exclude trashed rows. There are exactly
 * two ways in, and both are closed --
 * {@link JobSpecifications#notDeleted()} is passed unconditionally by
 * {@link #getJobs}, and single-row reads go through {@link #requireLiveJob},
 * which uses a query with the filter written into its JPQL. Do not reach for
 * {@code jobRepository.findById} or the inherited {@code findAll}: they are
 * blind to soft delete, which is how a trashed posting gets back onto the site.
 *
 * <p><b>What soft delete deliberately does not reach.</b> The five
 * {@code /for-job/{id}} routes -- notices, syllabi, cutoffs, exam calendar and
 * papers -- key on a bare {@code jobId} with no foreign key to {@code jobs}, and
 * they are <i>not</i> filtered by this class. That is a decision, not an
 * oversight: a notice or a previous paper is content in its own right, listed on
 * its own page and reachable on its own URL, so retiring a duplicate job posting
 * must not silently take a syllabus offline with it. The consequence to be aware
 * of is that {@code GET /api/notices/for-job/5} still answers for a trashed job
 * 5, even though {@code /api/jobs/5} is now a 404. Nothing on the site makes
 * that call -- the only page that does is the job detail page, which no longer
 * renders -- so this is reachable by typing the URL and exposes nothing about
 * the trashed posting itself. If the child content should ever follow the job
 * into the trash, that needs its own {@code deleted_at} per table; do not try to
 * fake it with a join that does not exist.
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
                // First and unconditional. Every other filter here is optional and
                // returns null when unset; this one is never optional, because a
                // trashed job must not appear on any listing under any parameters.
                JobSpecifications.notDeleted(),
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
        return JobDetailResponse.from(withComputedStatus(requireLiveJob(id)));
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
        job.setDeletedAt(null); // and a client-supplied deletedAt would create a pre-trashed job
        validateDates(job);
        Job saved = jobRepository.save(job);
        return JobDetailResponse.from(withComputedStatus(saved));
    }

    @Transactional
    public JobDetailResponse updateJob(Long id, Job updatedJob) {
        Job existing = requireLiveJob(id);

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

    /**
     * Moves one job to the trash. This is what the admin "Delete" link calls.
     *
     * It is no longer a hard delete. The row stays in the database with
     * deleted_at stamped, disappears from every public listing and from the
     * detail page immediately, and can be restored from the trash screen.
     * Permanent removal is {@link #purge}, which is only reachable from that
     * screen.
     *
     * Still answers 404 for an id that does not exist or is already trashed, so
     * the admin UI behaves exactly as it did before.
     */
    @Transactional
    public void deleteJob(Long id) {
        BulkResult result = trash(List.of(id));
        if (result.changed() == 0) {
            throw new NoSuchElementException("Job not found with id " + id);
        }
    }

    // ---- trash (admin only) ----

    /**
     * Outcome of a batch action.
     *
     * {@code requested} is how many distinct ids were asked for, {@code changed}
     * how many rows the statement actually moved. The gap is the ids that were
     * already in the target state or do not exist, and the admin screen prints
     * it -- "12 moved to trash, 2 skipped" is information; a bare "done" when two
     * rows silently did nothing is not.
     */
    public record BulkResult(int requested, int changed) {
        public int skipped() {
            return Math.max(0, requested - changed);
        }
    }

    /**
     * Moves a batch of live jobs to the trash.
     *
     * The ids are de-duplicated first: a list containing the same id twice would
     * otherwise report a requested count the admin cannot reconcile with what
     * they selected. An empty list is a no-op rather than an error, because a
     * bulk action with nothing selected is a mis-click, not a failure.
     */
    @Transactional
    public BulkResult trash(List<Long> ids) {
        List<Long> unique = distinctIds(ids);
        if (unique.isEmpty()) {
            return new BulkResult(0, 0);
        }
        int changed = jobRepository.trashByIds(unique, Instant.now());
        // The view buffer holds an in-memory total per job and is not part of
        // this transaction. Dropping the trashed ids stops it answering with a
        // cached number for a job that is no longer public.
        unique.forEach(viewCountBuffer::forget);
        return new BulkResult(unique.size(), changed);
    }

    /** Brings a batch of trashed jobs back onto the site. */
    @Transactional
    public BulkResult restore(List<Long> ids) {
        List<Long> unique = distinctIds(ids);
        if (unique.isEmpty()) {
            return new BulkResult(0, 0);
        }
        return new BulkResult(unique.size(), jobRepository.restoreByIds(unique));
    }

    /**
     * Deletes trashed jobs for good. Irreversible.
     *
     * Only rows already in the trash can be purged: the query resolves the ids
     * against {@code deleted_at IS NOT NULL} and anything live is silently left
     * alone rather than destroyed. So an id sent here by mistake costs nothing,
     * and emptying the trash can never take out a live posting.
     *
     * Goes through entity removal rather than a bulk DELETE so that the
     * job_fees and job_age_relaxation rows go with it -- see the note on
     * JobRepository.findTrashedByIds.
     */
    @Transactional
    public BulkResult purge(List<Long> ids) {
        List<Long> unique = distinctIds(ids);
        if (unique.isEmpty()) {
            return new BulkResult(0, 0);
        }
        List<Job> trashed = jobRepository.findTrashedByIds(unique);
        jobRepository.deleteAll(trashed);
        trashed.forEach(job -> viewCountBuffer.forget(job.getId()));
        return new BulkResult(unique.size(), trashed.size());
    }

    /** Everything in the trash, newest first. */
    @Transactional(readOnly = true)
    public List<TrashedJobResponse> listTrash() {
        return jobRepository.findTrashed().stream()
                .map(TrashedJobResponse::from)
                .toList();
    }

    /** Count only, for the badge on the manage screen. */
    @Transactional(readOnly = true)
    public long countTrash() {
        return jobRepository.countTrashed();
    }

    /**
     * Groups live jobs that might be the same posting entered twice.
     *
     * See {@link DuplicateKeys} for why there are two keys and why the loose one
     * is never enough to delete on. Nothing is deleted here -- this returns
     * groups for an admin to look at.
     *
     * Groups are ordered worst-first: the ones containing an exact repeat come
     * first, then by size, so the screen opens on the rows that are actually
     * safe to clear rather than on a pile of same-name-different-year pairs.
     */
    @Transactional(readOnly = true)
    public List<DuplicateGroupResponse> findDuplicates() {
        Map<String, List<DuplicateGroupResponse.Member>> groups = new LinkedHashMap<>();

        for (Object[] row : jobRepository.findLiveForDuplicateScan()) {
            Long id = (Long) row[0];
            String postName = (String) row[1];
            String organization = (String) row[2];
            JobCategory category = (JobCategory) row[3];
            String advertisementNo = (String) row[4];
            LocalDate lastDate = (LocalDate) row[5];
            Instant createdAt = (Instant) row[6];

            groups.computeIfAbsent(DuplicateKeys.looseKey(postName, organization),
                            key -> new ArrayList<>())
                    .add(new DuplicateGroupResponse.Member(
                            id, Slugs.jobSlug(postName, id), postName, organization,
                            category, advertisementNo, lastDate, createdAt,
                            DuplicateKeys.strictKey(postName, organization, lastDate)));
        }

        // Written out rather than chained through Comparator.comparing(...):
        // one of the keys is a boolean and one is reversed, and the generic
        // inference on that chain is the kind of thing that compiles on one
        // JDK and not the next. This is longer and cannot be misread.
        Comparator<DuplicateGroupResponse> worstFirst = (a, b) -> {
            if (a.hasExactRepeat() != b.hasExactRepeat()) {
                return a.hasExactRepeat() ? -1 : 1;             // real repeats at the top
            }
            if (a.count() != b.count()) {
                return Integer.compare(b.count(), a.count());   // then the biggest piles
            }
            return a.postName().compareToIgnoreCase(b.postName());
        };

        return groups.entrySet().stream()
                .filter(entry -> entry.getValue().size() > 1)
                .map(entry -> DuplicateGroupResponse.of(entry.getKey(), entry.getValue()))
                .sorted(worstFirst)
                .toList();
    }

    /**
     * Answers "which of these rows already exist?" for the CSV importer.
     *
     * Runs the same single scan as {@link #findDuplicates}, builds two lookups
     * from it, and reports the strongest match per submitted row: an exact hit on
     * post name + organisation + last date if there is one, otherwise a loose hit
     * on post name + organisation.
     *
     * Where two live jobs share a key, the lowest id is reported. That is the
     * original, and it is the one the admin should be editing instead of
     * importing a third copy.
     *
     * A row with a blank post name matches nothing: the importer has already
     * rejected it for a missing required column, and a blank key would otherwise
     * collide with every other blank.
     */
    @Transactional(readOnly = true)
    public DuplicateCheckResponse checkForDuplicates(List<DuplicateCheckRequest.Candidate> rows) {
        if (rows == null || rows.isEmpty()) {
            return new DuplicateCheckResponse(List.of());
        }

        Map<String, Object[]> byStrictKey = new HashMap<>();
        Map<String, Object[]> byLooseKey = new HashMap<>();

        for (Object[] row : jobRepository.findLiveForDuplicateScan()) {
            String postName = (String) row[1];
            String organization = (String) row[2];
            LocalDate lastDate = (LocalDate) row[5];
            // putIfAbsent, and the scan is ordered by id ascending, so the row
            // kept here is always the oldest of a colliding set.
            byStrictKey.putIfAbsent(DuplicateKeys.strictKey(postName, organization, lastDate), row);
            byLooseKey.putIfAbsent(DuplicateKeys.looseKey(postName, organization), row);
        }

        List<DuplicateCheckResponse.Match> matches = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            DuplicateCheckRequest.Candidate candidate = rows.get(i);
            if (candidate == null || DuplicateKeys.normalise(candidate.postName()).isEmpty()) {
                continue;
            }

            Object[] hit = byStrictKey.get(DuplicateKeys.strictKey(
                    candidate.postName(), candidate.organization(), candidate.lastDate()));
            boolean exact = hit != null;
            if (hit == null) {
                hit = byLooseKey.get(DuplicateKeys.looseKey(
                        candidate.postName(), candidate.organization()));
            }
            if (hit == null) {
                continue;
            }

            Long id = (Long) hit[0];
            String postName = (String) hit[1];
            matches.add(new DuplicateCheckResponse.Match(
                    i, id, Slugs.jobSlug(postName, id), postName, (LocalDate) hit[5], exact));
        }

        return new DuplicateCheckResponse(matches);
    }

    // ---- helpers ----

    /**
     * Drops nulls and repeats while keeping the order the admin selected in.
     *
     * A null inside the id list would become "IN (..., NULL)" and quietly match
     * nothing, so it is removed here rather than left to produce a count that
     * does not add up.
     */
    private static List<Long> distinctIds(List<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        return ids.stream().filter(Objects::nonNull).distinct().toList();
    }

    /**
     * One live job, or 404.
     *
     * Named for what it does. The old name was requireJob, which said nothing
     * about soft delete and would have been the natural thing to reach for from a
     * new code path that then served a trashed posting to the public.
     */
    private Job requireLiveJob(Long id) {
        return jobRepository.findLiveById(id)
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
     * What each listing section needs in order to behave on the site.
     *
     * This used to read "anything except Upcoming needs both dates", and that was
     * the single biggest reason real notifications never reached the site: the
     * CSV pipeline writes AUTO on every row, a notification is routinely
     * published before its form dates are announced, and so every dateless
     * vacancy was refused instead of listed as upcoming.
     *
     * The refusal was not protecting anything either. AUTO means "work the status
     * out from the dates", and both halves of that calculation already read a
     * missing start date as Upcoming: computeStatus() below returns UPCOMING when
     * applicationStartDate is null, and the UPCOMING branch of
     * JobSpecifications.hasStatus matches an AUTO row whose start date is null and
     * whose last date is null or still ahead. A dateless AUTO job lands in
     * Upcoming on its own.
     *
     * So Upcoming asks for nothing; Latest is a hand-made pin meaning "open now",
     * which needs a real window or it sits on the homepage for ever; and AUTO
     * refuses exactly one combination, a start date with no last date, because
     * that row computes as ACTIVE and then nothing ever closes it.
     *
     * The out-of-order check is no longer skipped for Upcoming. An estimated date
     * may be absent or already past -- that is why Upcoming is exempt from
     * needing dates at all -- but a last date before the start date is not an
     * estimate, it is a contradiction, and a visitor who sees one stops trusting
     * the listing.
     *
     * mapRows() in frontend/lib/csv.js applies the same rule in the browser before
     * the CSV is sent. The two have to agree: if a file passes there and fails
     * here, the importer stops part-way through a batch with some rows published
     * and some not.
     */
    private void validateDates(Job job) {
        ListingSection section = job.getListingSection() == null
                ? ListingSection.AUTO
                : job.getListingSection();

        if (section == ListingSection.LATEST
                && (job.getApplicationStartDate() == null || job.getLastDate() == null)) {
            throw new BadRequestException(
                    "Application start date and last date are both required to pin a job to Latest jobs");
        }
        if (section == ListingSection.AUTO
                && job.getApplicationStartDate() != null && job.getLastDate() == null) {
            throw new BadRequestException(
                    "Last date is required when an application start date is set, "
                            + "otherwise the job would never be shown as closed");
        }
        if (job.getApplicationStartDate() != null && job.getLastDate() != null
                && job.getLastDate().isBefore(job.getApplicationStartDate())) {
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
