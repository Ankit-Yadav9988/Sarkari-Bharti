package com.sarkariportal.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Turns exceptions into the JSON error shape the frontend expects.
 *
 * Without this, a request for a job that does not exist bubbles up as a 500, and
 * the frontend checks specifically for 404 to render its "not found" page.
 *
 * The other half of its job is not leaking. Anything unrecognised is logged
 * server-side and answered with a fixed message, so a stack trace or a SQL
 * fragment never reaches a browser.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage() == null ? "Not found" : e.getMessage()));
    }

    /** Validation the caller can act on, e.g. a malformed email address. */
    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(BadRequestException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    /** e.g. /api/jobs?category=NOT_A_REAL_CATEGORY or /api/jobs/abc for a Long path. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleBadParam(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Invalid value for parameter '" + e.getName() + "'"));
    }

    /** Malformed JSON body. The parser's message names internal types, so it is dropped. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Malformed request body"));
    }

    /** A unique constraint or a not-null column, e.g. two subscribers racing on one email. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConflict(DataIntegrityViolationException e) {
        log.warn("Data integrity violation: {}", e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "That value is already in use"));
    }

    /**
     * Let Spring Security's own handlers deal with authorisation, so an
     * unauthorised call still gets the 401/403 SecurityConfig defines rather than
     * being flattened into a 500 by the catch-all below.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public void handleAccessDenied(AccessDeniedException e) {
        throw e;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Something went wrong. Please try again."));
    }
}
