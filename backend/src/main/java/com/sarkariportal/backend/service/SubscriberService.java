package com.sarkariportal.backend.service;

import com.sarkariportal.backend.config.BadRequestException;
import com.sarkariportal.backend.dto.PageResponse;
import com.sarkariportal.backend.dto.SubscriberResponse;
import com.sarkariportal.backend.model.Subscriber;
import com.sarkariportal.backend.repository.SubscriberRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;

@Service
public class SubscriberService {

    /** Good-enough shape check; the real validation is whether mail bounces. */
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$");

    /**
     * Cap on stored address length. Not arbitrary: the column is varchar(255),
     * and an over-long value would otherwise reach the database and fail there
     * with a 500 instead of a clear message here.
     */
    private static final int MAX_EMAIL_LENGTH = 254;

    private static final int MAX_INTEREST_LENGTH = 60;

    private final SubscriberRepository subscriberRepository;

    public SubscriberService(SubscriberRepository subscriberRepository) {
        this.subscriberRepository = subscriberRepository;
    }

    /**
     * Adds an address to the alert list, idempotently: subscribing twice is a
     * success rather than an error, because people forget they already signed up
     * and an error there reads as a broken site.
     *
     * Deliberately NOT @Transactional. The duplicate-email race below is caught
     * and swallowed, and inside a surrounding transaction that would not work:
     * a DataIntegrityViolationException marks the transaction rollback-only, so
     * returning normally afterwards fails at commit with
     * UnexpectedRollbackException. Letting save() own its transaction means the
     * failed insert rolls back by itself and the catch here is meaningful.
     *
     * @return true when a new row was created. Used only for logging -- the
     *         endpoint's response is identical either way, so it cannot be used
     *         to test whether an address is on the list.
     */
    public boolean subscribe(String email, String interest) {
        String clean = normaliseEmail(email);
        if (subscriberRepository.findByEmailIgnoreCase(clean).isPresent()) {
            return false;
        }
        Subscriber subscriber = new Subscriber();
        subscriber.setEmail(clean);
        subscriber.setInterest(trimToLength(interest, MAX_INTEREST_LENGTH));
        try {
            subscriberRepository.save(subscriber);
            return true;
        } catch (DataIntegrityViolationException e) {
            // Two simultaneous signups with the same address: the unique
            // constraint is the real guard, and losing the race is still a
            // success from the visitor's point of view.
            return false;
        }
    }

    @Transactional(readOnly = true)
    public PageResponse<SubscriberResponse> getAll(Integer page, Integer size) {
        int resolvedPage = (page == null || page < 0) ? 0 : page;
        int resolvedSize = (size == null || size < 1)
                ? 100
                : Math.min(size, 500);

        Page<Subscriber> found = subscriberRepository.findAll(
                PageRequest.of(resolvedPage, resolvedSize, Sort.by(Sort.Direction.DESC, "createdAt")));

        return PageResponse.from(found, found.getContent().stream()
                .map(SubscriberResponse::from)
                .toList());
    }

    @Transactional
    public void delete(Long id) {
        if (!subscriberRepository.existsById(id)) {
            throw new NoSuchElementException("Subscriber not found with id " + id);
        }
        subscriberRepository.deleteById(id);
    }

    // ---- helpers ----

    private static String normaliseEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new BadRequestException("Please enter a valid email address");
        }
        String clean = email.trim().toLowerCase(Locale.ROOT);
        if (clean.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(clean).matches()) {
            throw new BadRequestException("Please enter a valid email address");
        }
        return clean;
    }

    private static String trimToLength(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
