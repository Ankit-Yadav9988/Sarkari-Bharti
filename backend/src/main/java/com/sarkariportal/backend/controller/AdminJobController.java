package com.sarkariportal.backend.controller;

import com.sarkariportal.backend.config.BadRequestException;
import com.sarkariportal.backend.dto.BulkActionResponse;
import com.sarkariportal.backend.dto.DuplicateCheckRequest;
import com.sarkariportal.backend.dto.DuplicateCheckResponse;
import com.sarkariportal.backend.dto.DuplicateGroupResponse;
import com.sarkariportal.backend.dto.TrashedJobResponse;
import com.sarkariportal.backend.service.JobService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-only job housekeeping: bulk trash, restore, permanent delete, and the
 * duplicate finder.
 *
 * <h2>Why this is not on JobController</h2>
 *
 * SecurityConfig makes <b>GET /api/jobs/** public</b>. That rule is correct --
 * the public site is the point -- but it means a {@code GET /api/jobs/trash}
 * added to JobController would have served the trash to the entire internet, and
 * the only thing standing between that and production would have been
 * remembering to add a matcher above line 85 in the right order.
 *
 * Nothing under {@code /api/admin} is listed in the public allowlist, so every
 * route in this class falls through to {@code .anyRequest().hasRole("ADMIN")}.
 * The base path <i>is</i> the authorisation, which is a thing a reviewer can
 * check by reading the class declaration rather than by cross-referencing a
 * filter chain. Adding a GET here is safe by construction; adding one to
 * JobController is not.
 *
 * <h2>Why the write actions are POST</h2>
 *
 * Trash, restore and purge all take a list of ids in a body. DELETE with a
 * request body is legal but poorly supported by proxies and by {@code fetch} in
 * some browsers, and a bulk action is not idempotent in the way DELETE implies.
 * They are POSTs with plain verb names.
 */
@RestController
@RequestMapping("/api/admin/jobs")
public class AdminJobController {

    /**
     * Ceiling on ids per request.
     *
     * The admin screens page at 25 and the duplicate finder never selects more
     * than a screenful, so this is far above any real use. It exists so that a
     * malformed or hostile body cannot turn one request into an IN clause with a
     * hundred thousand parameters -- Postgres has its own limit and the failure
     * there is an opaque driver error rather than a message anyone can act on.
     */
    private static final int MAX_IDS_PER_REQUEST = 500;

    /** Same reasoning, for the importer's pre-flight check. */
    private static final int MAX_ROWS_PER_CHECK = 1_000;

    private final JobService jobService;

    public AdminJobController(JobService jobService) {
        this.jobService = jobService;
    }

    // ---- trash ----

    /** GET /api/admin/jobs/trash -> everything in the trash, newest first. */
    @GetMapping("/trash")
    public List<TrashedJobResponse> trash() {
        return jobService.listTrash();
    }

    /**
     * GET /api/admin/jobs/trash/count -> just the number.
     *
     * The manage screen shows a "Trash (3)" link, and fetching the whole trash
     * on every visit to render one integer would be the wrong trade -- a trash
     * left alone for months is the case this has to stay cheap for.
     */
    @GetMapping("/trash/count")
    public Map<String, Long> trashCount() {
        return Map.of("count", jobService.countTrash());
    }

    /**
     * POST /api/admin/jobs/trash -> move jobs to the trash.
     *
     * Hidden from the site immediately, kept in the database, restorable.
     */
    @PostMapping("/trash")
    public ResponseEntity<BulkActionResponse> moveToTrash(@RequestBody BulkJobIdsRequest request) {
        return ResponseEntity.ok(BulkActionResponse.from(jobService.trash(ids(request))));
    }

    /** POST /api/admin/jobs/restore -> put trashed jobs back on the site. */
    @PostMapping("/restore")
    public ResponseEntity<BulkActionResponse> restore(@RequestBody BulkJobIdsRequest request) {
        return ResponseEntity.ok(BulkActionResponse.from(jobService.restore(ids(request))));
    }

    /**
     * POST /api/admin/jobs/purge -> delete trashed jobs for good.
     *
     * The only irreversible operation in the application. Ids belonging to live
     * jobs are ignored rather than acted on, so this cannot take out a posting
     * that is still on the site even if the wrong list is sent.
     */
    @PostMapping("/purge")
    public ResponseEntity<BulkActionResponse> purge(@RequestBody BulkJobIdsRequest request) {
        return ResponseEntity.ok(BulkActionResponse.from(jobService.purge(ids(request))));
    }

    // ---- duplicates ----

    /**
     * GET /api/admin/jobs/duplicates -> live jobs grouped by post name and
     * organisation, worst first.
     *
     * Read-only. Clearing a group is an ordinary call to /trash with the ids the
     * admin ticked, so there is no second delete path to keep correct.
     */
    @GetMapping("/duplicates")
    public List<DuplicateGroupResponse> duplicates() {
        return jobService.findDuplicates();
    }

    /**
     * POST /api/admin/jobs/duplicate-check -> which of these rows already exist.
     *
     * Called by the CSV importer before it publishes anything. See
     * DuplicateCheckRequest for why the candidates are sent up instead of the
     * catalogue being sent down.
     */
    @PostMapping("/duplicate-check")
    public DuplicateCheckResponse duplicateCheck(@RequestBody DuplicateCheckRequest request) {
        List<DuplicateCheckRequest.Candidate> rows =
                request == null || request.rows() == null ? List.of() : request.rows();
        if (rows.size() > MAX_ROWS_PER_CHECK) {
            throw new BadRequestException(
                    "Too many rows in one check (limit " + MAX_ROWS_PER_CHECK + ")");
        }
        return jobService.checkForDuplicates(rows);
    }

    // ---- request body ----

    /**
     * The body every bulk action takes.
     *
     * A record rather than {@code List<Long>} at the top level: a bare JSON array
     * is awkward to extend, and the first time this needs a second field (a
     * reason, a confirmation token) the wire format would have to change shape
     * rather than gain a key.
     */
    public record BulkJobIdsRequest(List<Long> ids) {
    }

    /**
     * Pulls the ids out of a request and refuses the two shapes that are not
     * worth passing on.
     *
     * An empty list is allowed through and handled as a no-op by the service --
     * a bulk button pressed with nothing selected is a mis-click and should not
     * produce an error dialog. A list that is too long is a 400, because
     * silently truncating it would report a smaller count than the admin
     * selected and leave them believing the rest were already done.
     */
    private static List<Long> ids(BulkJobIdsRequest request) {
        List<Long> ids = request == null || request.ids() == null ? List.of() : request.ids();
        if (ids.size() > MAX_IDS_PER_REQUEST) {
            throw new BadRequestException(
                    "Too many jobs in one request (limit " + MAX_IDS_PER_REQUEST + ")");
        }
        return ids;
    }
}
