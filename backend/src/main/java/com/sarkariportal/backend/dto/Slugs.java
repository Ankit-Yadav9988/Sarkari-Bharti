package com.sarkariportal.backend.dto;

import java.net.URI;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * URL-shaped helpers shared by the response records.
 *
 * Slugs are derived from the post name rather than stored in a column. That
 * keeps them automatically correct after an edit -- a stored slug would go
 * stale the first time a typo in a job title was fixed, and there is no
 * redirect table to catch it. The numeric id stays on the end, so the slug is
 * decoration: /jobs/sbi-clerk-recruitment-2026-5 and /jobs/5 both resolve, and
 * every link already shared keeps working.
 */
public final class Slugs {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    private static final Pattern EDGE_HYPHENS = Pattern.compile("(^-+)|(-+$)");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");

    /** Keeps URLs a sensible length without cutting off the meaningful part. */
    private static final int MAX_SLUG_WORDS_LENGTH = 70;

    private Slugs() {
    }

    /**
     * "SBI Clerk (Junior Associate) recruitment 2026" + 5
     *   -> "sbi-clerk-junior-associate-recruitment-2026-5"
     */
    public static String jobSlug(String postName, Long id) {
        if (id == null) {
            return null;
        }
        String words = slugifyWords(postName);
        return words.isEmpty() ? String.valueOf(id) : words + "-" + id;
    }

    /**
     * Extracts the trailing numeric id from a slug, so the same route handles
     * both forms. Returns null when there is no id to find, which the caller
     * turns into a 404 rather than guessing.
     */
    public static Long idFromSlug(String slug) {
        if (slug == null || slug.isBlank()) {
            return null;
        }
        String trimmed = slug.trim();
        int lastHyphen = trimmed.lastIndexOf('-');
        String candidate = (lastHyphen >= 0) ? trimmed.substring(lastHyphen + 1) : trimmed;
        try {
            long id = Long.parseLong(candidate);
            return id > 0 ? id : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * The host of the official notification, e.g. "ssc.nic.in", shown on the
     * job page as "Source: ssc.nic.in". In a category crowded with sites that
     * copy content and add nothing, linking out to the real notification is
     * most of what makes a page believable.
     */
    public static String sourceDomain(String... urls) {
        for (String url : urls) {
            if (url == null || url.isBlank()) {
                continue;
            }
            try {
                String host = URI.create(url.trim()).getHost();
                if (host == null || host.isBlank()) {
                    continue;
                }
                host = host.toLowerCase(Locale.ROOT);
                return host.startsWith("www.") ? host.substring(4) : host;
            } catch (IllegalArgumentException e) {
                // A malformed link is the admin's typo, not a reason to fail the
                // whole response -- fall through and try the next one.
            }
        }
        return null;
    }

    private static String slugifyWords(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        // Strip accents so "Jammu & Kashmír" does not lose the last word.
        String normalised = Normalizer.normalize(input, Normalizer.Form.NFD);
        normalised = DIACRITICS.matcher(normalised).replaceAll("");

        String slug = NON_ALNUM.matcher(normalised.toLowerCase(Locale.ROOT)).replaceAll("-");
        slug = EDGE_HYPHENS.matcher(slug).replaceAll("");

        if (slug.length() > MAX_SLUG_WORDS_LENGTH) {
            slug = slug.substring(0, MAX_SLUG_WORDS_LENGTH);
            // Do not leave a half word or a trailing hyphen at the cut.
            int lastHyphen = slug.lastIndexOf('-');
            if (lastHyphen > 20) {
                slug = slug.substring(0, lastHyphen);
            }
            slug = EDGE_HYPHENS.matcher(slug).replaceAll("");
        }
        return slug;
    }
}
