package com.sarkariportal.backend.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Sends one email over SMTP.
 *
 * Plain SMTP rather than a provider SDK because the sending account is set
 * entirely by environment variables: moving from Brevo to anything else is a
 * dashboard change, not a redeploy. The whole bean only exists when
 * `mail.enabled=true`, so a deployment with no mail configured starts exactly
 * as it did before and the alert endpoint answers with a clear "not
 * configured" instead of a stack trace.
 *
 * Nothing in here knows what a job alert looks like -- that is
 * {@link EmailContentBuilder}'s job. This class only has to get a message out
 * of the door and tell the truth about whether it did.
 */
@Service
@ConditionalOnProperty(name = "mail.enabled", havingValue = "true")
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String fromName;
    private final String replyTo;

    public MailService(JavaMailSender mailSender,
                       @Value("${mail.from-address}") String fromAddress,
                       @Value("${mail.from-name}") String fromName,
                       @Value("${mail.reply-to:}") String replyTo) {
        this.fromAddress = validateFrom(fromAddress);
        this.fromName = (fromName == null || fromName.isBlank()) ? "Sarkari Bharti" : fromName.trim();
        this.replyTo = (replyTo == null || replyTo.isBlank()) ? null : replyTo.trim();
        this.mailSender = mailSender;
    }

    /**
     * Fails the application context on a From address that cannot work.
     *
     * Checked at startup and not at send time on purpose. A bad From is not
     * discovered by the provider until the first message is attempted, and by
     * then the admin has clicked send, watched a progress bar, and been told
     * every single address failed -- with no clue why. Better to refuse to
     * boot.
     */
    private static String validateFrom(String from) {
        if (from == null || from.isBlank()) {
            throw new IllegalStateException(
                    "MAIL_FROM_ADDRESS is not set but MAIL_ENABLED is true. Set it to the "
                            + "address you verified as a sender with your mail provider, or set "
                            + "MAIL_ENABLED=false to turn email off.");
        }
        String clean = from.trim();
        if (!clean.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$")) {
            throw new IllegalStateException(
                    "MAIL_FROM_ADDRESS is not a valid email address: " + clean);
        }
        // Brevo, Gmail and the rest all reject a From the account has not
        // verified. "noreply@example.com" is the value people paste from a
        // tutorial and then spend an afternoon debugging.
        if (clean.toLowerCase(Locale.ROOT).endsWith("@example.com")) {
            throw new IllegalStateException(
                    "MAIL_FROM_ADDRESS is still the example value. Use the address you actually "
                            + "verified with your mail provider.");
        }
        return clean;
    }

    /**
     * Sends one message and returns normally, or throws.
     *
     * @param unsubscribeUrl goes in the List-Unsubscribe header as well as the
     *                       footer. Gmail and Outlook surface that header as a
     *                       native "unsubscribe" button next to the sender
     *                       name, and a bulk sender without one gets routed to
     *                       spam on reputation grounds alone.
     */
    public void send(String to, String subject, String html, String plainText, String unsubscribeUrl)
            throws Exception {
        MimeMessage message = mailSender.createMimeMessage();
        // MIXED_RELATED, not MULTIPART_MODE_NO. setText(plain, html) below has
        // to build a multipart/alternative body, and asking for it on a helper
        // that was told not to be multipart throws IllegalStateException on the
        // very first message -- which would have looked like "every address
        // failed" rather than like a coding mistake.
        MimeMessageHelper helper = new MimeMessageHelper(
                message, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                StandardCharsets.UTF_8.name());

        helper.setFrom(fromAddress, fromName);
        helper.setTo(to);
        helper.setSubject(subject);
        // Both parts, text first: a client that cannot render HTML still gets a
        // readable message, and a message with no text alternative scores worse
        // with spam filters than one with.
        helper.setText(plainText, html);
        if (replyTo != null) {
            helper.setReplyTo(replyTo);
        }
        if (unsubscribeUrl != null && !unsubscribeUrl.isBlank()) {
            message.setHeader("List-Unsubscribe", "<" + unsubscribeUrl + ">");
            message.setHeader("List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
        }

        mailSender.send(message);
        // The subject, never the address. This line is quiet at the default INFO
        // level, but LOG_LEVEL=DEBUG is a normal thing to set while chasing a
        // problem, and it should not be the thing that writes every subscriber's
        // address into a log the hosting provider keeps.
        log.debug("Sent \"{}\"", subject);
    }
}
