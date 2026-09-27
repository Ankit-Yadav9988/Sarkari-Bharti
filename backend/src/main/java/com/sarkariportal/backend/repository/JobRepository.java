package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * JpaSpecificationExecutor is what lets JobService push category / state /
 * search / status filtering into SQL instead of streaming the whole table and
 * filtering in Java. See {@link JobSpecifications}.
 *
 * <p><b>Soft delete.</b> Since V7 a job is retired by stamping
 * {@code deleted_at} rather than being removed. Nothing in Spring Data applies
 * that filter for you, and the inherited {@code findAll()}, {@code findById},
 * {@code count()} and friends are all blind to it. Two rules keep that from
 * leaking onto the public site:
 *
 * <ol>
 *   <li>every query declared here that serves a public path spells out
 *       {@code AND j.deletedAt IS NULL} in its JPQL; and</li>
 *   <li>everything that goes through a Specification gets
 *       {@link JobSpecifications#notDeleted()} added by JobService, which
 *       passes it unconditionally rather than only when a filter is present.</li>
 * </ol>
 *
 * The methods below that deliberately <i>do</i> see trashed rows are named
 * {@code ...IncludingDeleted} or live under the {@code trash}/{@code purge}
 * vocabulary, so a reviewer can tell at a glance which side of the line a call
 * site is on.
 */
public interface JobRepository extends JpaRepository<Job, Long>, JpaSpecificationExecutor<Job> {

    /**
     * Adds a batch of accumulated views to a row in one statement.
     *
     * The old code did findById, mutate, save -- a SELECT plus an UPDATE of
     * every column, synchronously, on every single page load, and two
     * simultaneous readers could each read 100 and each write 101. This is a
     * single atomic increment, and ViewCountBuffer calls it once a minute per
     * job rather than once per visitor.
     *
     * @Transactional here rather than at the call site because the flush runs on
     * a scheduler thread with no surrounding transaction, and a @Modifying query
     * without one fails outright. Per-statement transactions are also what let
     * the buffer retry a single failed job without double-counting the rest.
     *
     * COALESCE because views is nullable on rows that predate the column.
     *
     * The deletedAt clause is not cosmetic: it makes this return 0 for a trashed
     * job, and ViewCountBuffer already treats a 0 as "the row is gone" and drops
     * the job from its in-memory cache. So trashing a job also stops its
     * buffered views being written back, for free.
     */
    @Transactional
    @Modifying
    @Query("UPDATE Job j SET j.views = COALESCE(j.views, 0) + :delta "
            + "WHERE j.id = :id AND j.deletedAt IS NULL")
    int incrementViews(@Param("id") Long id, @Param("delta") long delta);

    /**
     * Reads just the view count, not the whole row. ViewCountBuffer calls this
     * once per job per server lifetime to seed its in-memory total, so the view
     * endpoint can still answer with a real number without loading the entity
     * on every page view.
     *
     * This doubles as the existence check behind POST /api/jobs/{id}/view: an
     * empty result becomes a 404. The deletedAt clause is therefore what stops a
     * trashed job from still accepting and reporting views.
     */
    @Query("SELECT COALESCE(j.views, 0) FROM Job j WHERE j.id = :id AND j.deletedAt IS NULL")
    Optional<Long> findViewsById(@Param("id") Long id);

    /** One live job by id. The public detail page and every admin edit go through this. */
    @Query("SELECT j FROM Job j WHERE j.id = :id AND j.deletedAt IS NULL")
    Optional<Job> findLiveById(@Param("id") Long id);

    // ---- trash ----

    /**
     * Moves a batch of live jobs to the trash in one statement.
     *
     * A @Modifying bulk update rather than load-mutate-save per row: trashing 50
     * rows would otherwise be 50 selects and 50 full-column updates, and each one
     * would fire @PreUpdate and rewrite updated_at -- which the public page
     * prints as "Updated 24 Sep 2026". Retiring a posting is not an edit to it,
     * and a trashed-then-restored job should come back looking exactly as it
     * left, so updated_at is left alone here on purpose.
     *
     * "AND j.deletedAt IS NULL" makes this idempotent: re-running it on an
     * already-trashed job is a no-op rather than a second timestamp, so the
     * return count is an honest "how many rows this call actually changed".
     *
     * Bulk JPQL bypasses the persistence context, so any Job already loaded in
     * the current transaction keeps its stale deletedAt. Every caller here is a
     * short request that does not re-read the rows afterwards, and the response
     * is built from the ids rather than from entities, so there is nothing to go
     * stale -- but do not add a read-after-write to this transaction without a
     * flush/clear.
     */
    @Modifying
    @Query("UPDATE Job j SET j.deletedAt = :now WHERE j.id IN :ids AND j.deletedAt IS NULL")
    int trashByIds(@Param("ids") Collection<Long> ids, @Param("now") Instant now);

    /** Brings trashed jobs back. Same idempotence argument as trashByIds. */
    @Modifying
    @Query("UPDATE Job j SET j.deletedAt = NULL WHERE j.id IN :ids AND j.deletedAt IS NOT NULL")
    int restoreByIds(@Param("ids") Collection<Long> ids);

    /** Everything currently in the trash, newest first. Admin-only. */
    @Query("SELECT j FROM Job j WHERE j.deletedAt IS NOT NULL ORDER BY j.deletedAt DESC, j.id DESC")
    List<Job> findTrashed();

    /** How many rows are sitting in the trash, for the badge on the manage screen. */
    @Query("SELECT COUNT(j) FROM Job j WHERE j.deletedAt IS NOT NULL")
    long countTrashed();

    /**
     * The rows inside a batch that are actually in the trash.
     *
     * Purging is irreversible, so the service resolves the ids to real trashed
     * rows first rather than issuing a DELETE with an id list and trusting it --
     * an id that happens to belong to a live job must not be destroyed by the
     * "empty trash" path.
     *
     * This returns entities rather than ids because the purge has to go through
     * JPA's {@code deleteAll}, not a bulk JPQL DELETE. job_fees and
     * job_age_relaxation have no foreign key to jobs (see V1), so nothing
     * cascades at the database level, and a bulk JPQL delete does not trigger
     * JPA's own &#64;ElementCollection cascade either -- it would leave orphan fee
     * and age-relaxation rows behind forever. Entity removal deletes the child
     * rows properly. Purging happens when an admin clicks "delete permanently",
     * so loading the rows first costs nothing that matters.
     */
    @Query("SELECT j FROM Job j WHERE j.id IN :ids AND j.deletedAt IS NOT NULL")
    List<Job> findTrashedByIds(@Param("ids") Collection<Long> ids);

    // ---- duplicate finder ----

    /**
     * Every live job, cheaply, for the duplicate finder.
     *
     * A projection rather than entities: the finder needs six columns and
     * nothing else, and loading full Job entities would also pull both
     * &#64;ElementCollection maps -- two extra queries per row.
     *
     * The grouping is then done in Java, which is the opposite of the choice made
     * for the listing queries, and on purpose. The duplicate key has to be
     * normalised the same way the CSV importer normalises it (lower-case, then
     * whitespace, underscores and hyphens removed) and that is a regexp_replace
     * no JPQL dialect can express. Rather than write the first native query in
     * the codebase and then own two subtly different definitions of "the same
     * posting" in two languages, the rule lives once in
     * {@link com.sarkariportal.backend.service.DuplicateKeys} and the scan
     * happens in memory. This runs when an admin opens one screen, not on a page
     * view, so a single pass over a few thousand narrow rows is the cheaper
     * mistake to make.
     */
    @Query("SELECT j.id, j.postName, j.organization, j.category, j.advertisementNo, "
            + "j.lastDate, j.createdAt "
            + "FROM Job j WHERE j.deletedAt IS NULL ORDER BY j.id ASC")
    List<Object[]> findLiveForDuplicateScan();
}
