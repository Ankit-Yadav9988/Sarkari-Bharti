package com.sarkariportal.backend.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * The JSON envelope for every paged list endpoint.
 *
 * Spring's own Page serialises to a sprawling object with a nested "pageable"
 * and a deprecation warning attached to it, and its shape has changed between
 * Spring Data versions. This is a fixed, small contract the frontend can rely
 * on instead.
 *
 * @param content       the rows for this page only
 * @param page          zero-based page index, matching what was requested
 * @param size          page size actually used, after clamping
 * @param totalElements how many rows match the filters in total
 * @param totalPages    how many pages that works out to, minimum 1
 * @param first         true when this is page 0
 * @param last          true when there is nothing after this page
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last) {

    public static <E, D> PageResponse<D> from(Page<E> source, List<D> mapped) {
        // totalPages is reported as at least 1 so the frontend can render
        // "Page 1 of 1" for an empty result rather than "Page 1 of 0".
        int totalPages = Math.max(1, source.getTotalPages());
        return new PageResponse<>(
                mapped,
                source.getNumber(),
                source.getSize(),
                source.getTotalElements(),
                totalPages,
                source.isFirst(),
                source.isLast());
    }

    /** For endpoints that are not paged but must still return the same shape. */
    public static <D> PageResponse<D> unpaged(List<D> all) {
        return new PageResponse<>(all, 0, all.size(), all.size(), 1, true, true);
    }
}
