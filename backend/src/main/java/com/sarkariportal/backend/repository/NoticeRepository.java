package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Notice;
import com.sarkariportal.backend.model.NoticeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

/**
 * JpaSpecificationExecutor for the same reason as JobRepository: the Admit
 * Card / Result / Answer Key pages and the search box now filter and page in
 * SQL. See {@link NoticeSpecifications}.
 */
public interface NoticeRepository extends JpaRepository<Notice, Long>, JpaSpecificationExecutor<Notice> {

    /**
     * Notices attached to one job, for the "Admit card / Result" block on the
     * job detail page. Not paged: a single posting has a handful of these, and
     * the page shows all of them.
     */
    List<Notice> findByJobIdOrderByReleaseDateDesc(Long jobId);

    /** Newest of a type, oldest-null-last, for the homepage boxes. */
    List<Notice> findByTypeOrderByReleaseDateDesc(NoticeType type);
}
