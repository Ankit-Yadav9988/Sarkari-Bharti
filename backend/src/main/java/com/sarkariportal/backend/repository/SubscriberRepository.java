package com.sarkariportal.backend.repository;

import com.sarkariportal.backend.model.Subscriber;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SubscriberRepository extends JpaRepository<Subscriber, Long> {

    Optional<Subscriber> findByEmailIgnoreCase(String email);
}
