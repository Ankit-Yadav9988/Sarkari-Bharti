package com.sarkariportal.backend.service;

import com.sarkariportal.backend.dto.BroadcastRequest;

import java.util.List;

/**
 * Builds the HTML and plain-text bodies of a job alert.
 *
 * Every value that reaches the template is escaped here, and the template
 * itself is fixed. The admin console sends *structured* items -- a title, a
 * link, a line of detail -- and never a fragment of HTML, so there is no path
 * by which markup typed into the admin form becomes markup in a subscriber's
 * inbox. That matters more in email than on a page: an inbox has no CSP, and a
 * broken table tag renders as visible junk in half the clients on earth.
 *
 * The layout is deliberately old-fashioned -- a table, inline styles, no
 * external CSS, no images, no web fonts. Outlook still renders with Word's
 * engine, Gmail strips &lt;style&gt; blocks from forwarded mail, and an image-only
 * header shows as a grey box until the reader clicks "display images".
 */
public final class EmailContentBuilder {

    private EmailContentBuilder() {
    }

    private static final String MAROON = "#6d0f1a";
    private static final String GOLD = "#f0b323";
    private static final String INK = "#1a1a1a";
    private static final String MUTED = "#666666";

    public static String html(String siteName, String siteUrl, String heading,
                              List<BroadcastRequest.Item> items, String unsubscribeUrl) {
        StringBuilder rows = new StringBuilder();
        for (BroadcastRequest.Item item : items) {
            rows.append("""
                    <tr><td style="padding:0 0 18px 0;">
                      <a href="%s" style="color:#0b57d0;font-size:16px;font-weight:bold;text-decoration:underline;">%s</a>
                      %s
                    </td></tr>
                    """.formatted(
                    escapeAttr(item.url()),
                    escape(item.title()),
                    item.meta() == null || item.meta().isBlank()
                            ? ""
                            : "<div style=\"color:" + MUTED + ";font-size:13px;padding-top:4px;\">"
                              + escape(item.meta()) + "</div>"));
        }

        return """
                <!DOCTYPE html>
                <html lang="en"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>%1$s</title></head>
                <body style="margin:0;padding:0;background:#f4f4f4;">
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 10px;">
                <tr><td align="center">
                  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%%;background:#ffffff;border:1px solid #dddddd;">

                    <tr><td style="background:%2$s;border-bottom:4px solid %3$s;padding:18px 24px;">
                      <a href="%4$s" style="color:#ffffff;font-size:22px;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">%1$s</a>
                    </td></tr>

                    <tr><td style="padding:24px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;">
                      <h1 style="margin:0 0 18px 0;font-size:19px;color:%5$s;">%6$s</h1>
                      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">%7$s</table>
                    </td></tr>

                    <tr><td style="padding:8px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;">
                      <a href="%4$s" style="display:inline-block;background:%2$s;color:#ffffff;padding:11px 20px;text-decoration:none;font-weight:bold;font-size:14px;">See all latest jobs</a>
                    </td></tr>

                    <tr><td style="background:#fafafa;border-top:1px solid #dddddd;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;color:%8$s;font-size:12px;line-height:18px;">
                      You are getting this because you signed up for job alerts at
                      <a href="%4$s" style="color:%8$s;">%1$s</a>.<br>
                      We are not a government body. Always confirm details on the official website before applying.<br>
                      <a href="%9$s" style="color:%8$s;">Unsubscribe</a>
                    </td></tr>

                  </table>
                </td></tr></table>
                </body></html>
                """.formatted(
                escape(siteName), MAROON, GOLD, escapeAttr(siteUrl), INK,
                escape(heading), rows.toString(), MUTED, escapeAttr(unsubscribeUrl));
    }

    public static String plainText(String siteName, String siteUrl, String heading,
                                   List<BroadcastRequest.Item> items, String unsubscribeUrl) {
        StringBuilder out = new StringBuilder();
        out.append(heading).append("\n\n");
        for (BroadcastRequest.Item item : items) {
            out.append("* ").append(item.title()).append('\n');
            if (item.meta() != null && !item.meta().isBlank()) {
                out.append("  ").append(item.meta()).append('\n');
            }
            out.append("  ").append(item.url()).append("\n\n");
        }
        out.append("See all latest jobs: ").append(siteUrl).append("\n\n");
        out.append("---\n");
        out.append("You are getting this because you signed up for job alerts at ")
           .append(siteName).append(".\n");
        out.append("We are not a government body. Always confirm details on the official ")
           .append("website before applying.\n");
        out.append("Unsubscribe: ").append(unsubscribeUrl).append('\n');
        return out.toString();
    }

    /** Text going into element content. */
    static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    /**
     * Text going inside a double-quoted attribute.
     *
     * Escapes the quote as well, which {@link #escape} does not need to. A
     * title containing a straight quote is ordinary ("Constable ("Executive")"
     * appears verbatim in real notifications) and unescaped it would close the
     * attribute early and turn the rest of the title into attributes.
     */
    static String escapeAttr(String s) {
        return escape(s).replace("\"", "&quot;").replace("'", "&#39;");
    }
}
