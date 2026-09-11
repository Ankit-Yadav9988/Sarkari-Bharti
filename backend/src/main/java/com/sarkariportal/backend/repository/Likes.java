package com.sarkariportal.backend.repository;

import java.util.Locale;

/**
 * Shared LIKE-pattern building for the Specification classes.
 *
 * Exists so the escaping rule is written once. A user searching for "50%" or
 * "a_b" means those characters literally, and an unescaped "%" in a LIKE pattern
 * matches everything -- so a search box without this quietly returns the entire
 * table for a plausible query.
 */
final class Likes {

    /** The escape character every caller must pass to cb.like(...). */
    static final char ESCAPE = '\\';

    private Likes() {
    }

    /** Turns raw user input into a case-folded "contains" pattern. */
    static String contains(String raw) {
        return "%" + escape(raw.trim().toLowerCase(Locale.ROOT)) + "%";
    }

    private static String escape(String input) {
        return input.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
