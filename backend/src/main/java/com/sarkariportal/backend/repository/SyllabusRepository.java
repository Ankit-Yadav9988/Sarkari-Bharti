package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Syllabus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SyllabusRepository extends JpaRepository<Syllabus, Long>, JpaSpecificationExecutor<Syllabus> {

    /** Syllabi for one job, for the block on the job detail page. Unpaged. */
    List<Syllabus> findByJobIdOrderByUpdatedDateDesc(Long jobId);
}
