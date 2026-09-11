package com.sarkariportal.backend.util;

import java.util.regex.Pattern;

/**
 * Strips subscriber email addresses out of text that is about to be logged or
 * stored.
 *
 * Subscriber addresses are the only personal data this site holds, and two
 * places leak them without meaning to. Neither is a line of code that mentions
 * an address -- both are exception messages that happen to quote one back:
 *
 *   - A unique-constraint violation on `subscribers.email`. PostgreSQL puts the
 *     offending value in the message it raises:
 *     `ERROR: duplicate key value violates unique constraint "uk_subscribers_email"
 *      Detail: Key (email)=(someone@gmail.com) already exists.`
 *     That is logged at WARN, which is on by default.
 *
 *   - An SMTP rejection. Providers answer with the address they refused, so a
 *     `MailSendException` message routinely contains it, and the broadcast loop
 *     logs that message and also saves it to `email_broadcasts.error_message`.
 *
 * The local part is replaced and the domain kept, because the domain is the part
 * that carries the diagnostic value -- "every gmail.com address bounced" is a
 * different problem from "one address bounced" -- while the local part is what
 * identifies a person.
 *
 * This is not a general-purpose log sanitiser. It covers the two paths above,
 * which are the two that reliably carry an address. A full stack trace logged by
 * the catch-all handler could still contain one inside a nested message; fixing
 * that properly means a Logback rewriting appender, which is a much larger change
 * than the leak justifies.
 */
public final class LogSafe {

    /**
     * Deliberately looser than the address validator used on the way in. This has
     * to find an address sitting inside a sentence, possibly wrapped in
     * parentheses or angle brackets, so it stops at the characters that cannot
     * appear in an address rather than trying to describe a valid one.
     */
    private static final Pattern EMAIL = Pattern.compile(
            "[A-Za-z0-9._%+\\-]+@([A-Za-z0-9.\\-]+\\.[A-Za-z]{2,})");

    private LogSafe() {
    }

    /** Returns the text with every email-shaped run reduced to `***@domain`. */
    public static String redactEmails(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        return EMAIL.matcher(text).replaceAll("***@$1");
    }
}
