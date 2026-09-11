package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.PreviousYearPaper;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PreviousYearPaperRepository
        extends JpaRepository<PreviousYearPaper, Long>, JpaSpecificationExecutor<PreviousYearPaper> {

    /** Papers attached to one job, for the block on the job detail page. */
    List<PreviousYearPaper> findByJobIdOrderByExamYearDesc(Long jobId);

    /** Years that actually have papers, newest first, for the year filter. */
    @Query("SELECT DISTINCT p.examYear FROM PreviousYearPaper p "
            + "WHERE p.examYear IS NOT NULL ORDER BY p.examYear DESC")
    List<Integer> findDistinctExamYears();
}
