package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.ExamCalendarEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExamCalendarRepository
        extends JpaRepository<ExamCalendarEntry, Long>, JpaSpecificationExecutor<ExamCalendarEntry> {

    /** Calendar rows attached to one job, for the block on the job detail page. */
    List<ExamCalendarEntry> findByJobIdOrderByExamDateAsc(Long jobId);

    /**
     * Years that actually have calendar rows, for the year filter.
     *
     * Ascending, unlike the cut-off and paper equivalents. Those are archives
     * read backwards from the most recent; a calendar is read forwards, and the
     * year a visitor wants first is the current one, not the newest one on file.
     */
    @Query("SELECT DISTINCT e.examYear FROM ExamCalendarEntry e "
            + "WHERE e.examYear IS NOT NULL ORDER BY e.examYear ASC")
    List<Integer> findDistinctExamYears();
}
