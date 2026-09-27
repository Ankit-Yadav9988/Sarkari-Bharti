package com.sarkariportal.backend.dto;

import com.sarkariportal.backend.model.JobCategory;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A set of live jobs that share a post name and an organisation, for the admin
 * "Possible duplicates" screen.
 *
 * <p>The word <i>possible</i> is doing real work. Government recruitment reuses
 * post names every year -- "Combined Graduate Level Exam" is the same name in
 * 2025 and 2026 and those are two different, both-wanted postings. So a group
 * appearing here is not an accusation, it is a question.
 *
 * <p>What makes the screen usable is the distinction inside each group. Members
 * sharing the same <i>strict</i> key -- same post, same organisation, <b>same
 * last date</b> -- are the same notification entered twice, which is what the
 * daily pipeline produces when it re-reads a notification it already published.
 * Those are marked {@code exactRepeat} and every copy after the first is marked
 * {@code suggestedTrash}, so the admin can clear the safe cases with one click
 * and read the rest properly.
 *
 * <p><b>Why the oldest copy is the one kept.</b> The job id is part of the
 * public URL (/jobs/sbi-clerk-recruitment-2026-5), so the older row is the one
 * search engines have indexed and the one any shared link points at. Keeping it
 * and trashing the later copy means no live URL changes. The admin can uncheck
 * and choose differently; this is a default, not a rule.
 */
public record DuplicateGroupResponse(
        String key,
        String postName,
        String organization,
        int count,
        boolean hasExactRepeat,
        List<Member> members) {

    /**
     * One job inside a group.
     *
     * {@code lastDate}, {@code advertisementNo} and {@code createdAt} are here
     * because they are what actually lets a human tell two rows apart: a
     * different deadline or a different advertisement number is the difference
     * between last year's posting and a stray copy of this year's.
     */
    public record Member(
            Long id,
            String slug,
            String postName,
            String organization,
            JobCategory category,
            String advertisementNo,
            LocalDate lastDate,
            Instant createdAt,
            String strictKey,
            boolean exactRepeat,
            boolean suggestedTrash) {

        /**
         * Built by JobService from the projection query, before the group is
         * assembled -- at which point it is not yet known whether this row is an
         * exact repeat of another, so those two flags are filled in by
         * {@link DuplicateGroupResponse#of}.
         */
        public Member(Long id, String slug, String postName, String organization,
                      JobCategory category, String advertisementNo, LocalDate lastDate,
                      Instant createdAt, String strictKey) {
            this(id, slug, postName, organization, category, advertisementNo, lastDate,
                    createdAt, strictKey, false, false);
        }

        private Member withFlags(boolean exactRepeat, boolean suggestedTrash) {
            return new Member(id, slug, postName, organization, category, advertisementNo,
                    lastDate, createdAt, strictKey, exactRepeat, suggestedTrash);
        }
    }

    /**
     * Assembles a group and works out which members are safe to clear.
     *
     * {@code looseKey} is passed in rather than derived from a member: it is
     * already the key JobService grouped on, and reconstructing it here would be
     * a second definition of the same string that could drift from
     * DuplicateKeys.
     *
     * Members are sorted by id ascending first, which is what makes "the first
     * one wins" mean "the oldest one wins" rather than depending on whatever
     * order the database returned.
     */
    public static DuplicateGroupResponse of(String looseKey, List<Member> raw) {
        List<Member> ordered = raw.stream()
                .sorted(Comparator.comparing(Member::id))
                .toList();

        Map<String, Integer> perStrictKey = new HashMap<>();
        for (Member member : ordered) {
            perStrictKey.merge(member.strictKey(), 1, Integer::sum);
        }

        Set<String> alreadyKept = new HashSet<>();
        List<Member> flagged = ordered.stream()
                .map(member -> {
                    boolean repeat = perStrictKey.getOrDefault(member.strictKey(), 0) > 1;
                    // add() is false once this strict key has been seen, so the
                    // first (lowest-id) copy is kept and every later one is
                    // suggested for the trash.
                    boolean keeper = alreadyKept.add(member.strictKey());
                    return member.withFlags(repeat, repeat && !keeper);
                })
                .toList();

        Member first = flagged.get(0);
        return new DuplicateGroupResponse(
                looseKey,
                first.postName(),
                first.organization(),
                flagged.size(),
                flagged.stream().anyMatch(Member::exactRepeat),
                flagged);
    }
}
