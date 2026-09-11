package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.EmailBroadcast;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmailBroadcastRepository extends JpaRepository<EmailBroadcast, Long> {

    /** Most recent sends first, for the "last sent" line on the admin screen. */
    Page<EmailBroadcast> findAllByOrderByStartedAtDesc(Pageable pageable);
}
