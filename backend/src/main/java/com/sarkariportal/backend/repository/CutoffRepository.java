package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Cutoff;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CutoffRepository extends JpaRepository<Cutoff, Long>, JpaSpecificationExecutor<Cutoff> {

    /** Cut-offs for one job, for the block on the job detail page. Unpaged. */
    List<Cutoff> findByJobIdOrderByExamYearDesc(Long jobId);

    /**
     * The distinct years that have data, newest first, for the year filter.
     *
     * Queried rather than generated from a range: offering 2015 in a dropdown
     * that returns nothing is worse than not offering it, and the years with
     * data are not contiguous.
     */
    @Query("SELECT DISTINCT c.examYear FROM Cutoff c WHERE c.examYear IS NOT NULL ORDER BY c.examYear DESC")
    List<Integer> findDistinctExamYears();
}
