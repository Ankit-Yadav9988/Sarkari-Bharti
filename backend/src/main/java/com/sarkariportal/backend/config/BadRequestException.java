package com.sarkariportal.backend.config;

/**
 * Something the caller sent is wrong and they can fix it.
 *
 * A dedicated type rather than IllegalArgumentException so the 400 handler can
 * echo the message safely. IllegalArgumentException is thrown all over the JDK
 * and by Spring itself, and echoing those messages back would turn internal
 * detail into a public API response.
 */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
