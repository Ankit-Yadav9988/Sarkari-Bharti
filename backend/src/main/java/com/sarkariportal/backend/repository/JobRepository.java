package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * JpaSpecificationExecutor is what lets JobService push category / state /
 * search / status filtering into SQL instead of streaming the whole table and
 * filtering in Java. See {@link JobSpecifications}.
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
     */
    @Transactional
    @Modifying
    @Query("UPDATE Job j SET j.views = COALESCE(j.views, 0) + :delta WHERE j.id = :id")
    int incrementViews(@Param("id") Long id, @Param("delta") long delta);

    /**
     * Reads just the view count, not the whole row. ViewCountBuffer calls this
     * once per job per server lifetime to seed its in-memory total, so the view
     * endpoint can still answer with a real number without loading the entity
     * on every page view.
     */
    @Query("SELECT COALESCE(j.views, 0) FROM Job j WHERE j.id = :id")
    Optional<Long> findViewsById(@Param("id") Long id);
}
