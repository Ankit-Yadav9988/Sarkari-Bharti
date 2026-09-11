package com.sarkariportal.backend.dto;

import java.util.List;

/**
 * What the admin console posts to start a broadcast.
 *
 * Structured items, never a block of HTML. The admin is authenticated, so this
 * is not about keeping an attacker out -- it is that the email template lives
 * on the server, where it can be fixed once for everybody, rather than being
 * reassembled in a browser that may be running a two-year-old build. It also
 * means the server can escape every value with no ambiguity about what was
 * meant to be markup.
 */
public record BroadcastRequest(
        String subject,
        String heading,
        List<Item> items) {

    /**
     * One line in the alert.
     *
     * @param title what the reader clicks, e.g. "SSC CGL 2026 Tier-1 Admit Card"
     * @param url   where it goes -- an absolute https link to the page on this site
     * @param meta  the small grey line under it, e.g. "Staff Selection Commission · Last date 14 Oct 2026"
     */
    public record Item(String title, String url, String meta) {
    }
}
