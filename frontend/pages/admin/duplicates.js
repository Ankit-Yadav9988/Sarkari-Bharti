import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AdminGuard from '../../components/AdminGuard';
import AdminNav from '../../components/AdminNav';
import { categoryLabel, formatDate, jobHref } from '../../lib/api';
import { fetchDuplicates, trashJobs, formatWhen } from '../../lib/adminJobs';

const NAMES_IN_CONFIRM = 8;

/**
 * Finds job postings that look like the same posting entered twice.
 *
 * <b>Why there are two levels of "duplicate" here.</b> Grouping on post name and
 * organisation alone is not enough to act on. "Combined Graduate Level Exam" at
 * the SSC is a real posting in 2025 and a different real posting in 2026, and a
 * tool that treated those as duplicates would quietly delete last year's
 * notification -- which is still the page people search for. So this screen
 * groups on post name and organisation, but only <i>marks</i> a member as a
 * repeat when the last date matches too. Same post, same body, same deadline is
 * the same notification twice; a different deadline is next year's.
 *
 * Only the marked ones are ticked when the screen loads. The rest are there to
 * be looked at, and the admin can tick them if they disagree.
 */
export default function AdminDuplicates() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [onlyRepeats, setOnlyRepeats] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchDuplicates()
      .then(list => {
        if (cancelled) return;
        const safe = Array.isArray(list) ? list : [];
        setGroups(safe);
        // Pre-tick exactly the copies the server judged to be repeats, never
        // the first of them. Arriving at a screen with a safe cleanup already
        // selected is the whole value of this page; pre-ticking anything
        // less certain would make the default destructive.
        const suggested = new Set();
        for (const group of safe) {
          for (const member of group.members || []) {
            if (member.suggestedTrash) suggested.add(member.id);
          }
        }
        setSelected(suggested);
        setError('');
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [reloadToken]);

  const visible = useMemo(
    () => (onlyRepeats ? groups.filter(g => g.hasExactRepeat) : groups),
    [groups, onlyRepeats]
  );

  const repeatGroupCount = useMemo(
    () => groups.filter(g => g.hasExactRepeat).length,
    [groups]
  );

  // Flat lookup so the confirmation can name a posting that sits in a group the
  // filter is currently hiding. Hiding a row must not quietly drop it from the
  // selection -- the count on the button would then disagree with what gets
  // deleted.
  const byId = useMemo(() => {
    const map = new Map();
    for (const group of groups) {
      for (const member of group.members || []) map.set(member.id, member);
    }
    return map;
  }, [groups]);

  function toggleOne(id) {
    setNotice('');
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Ticks every member of one group except the oldest, which is the keeper. */
  function selectGroupExceptFirst(group) {
    setNotice('');
    const members = group.members || [];
    setSelected(prev => {
      const next = new Set(prev);
      members.slice(1).forEach(m => next.add(m.id));
      next.delete(members[0]?.id);
      return next;
    });
  }

  function clearGroup(group) {
    setNotice('');
    setSelected(prev => {
      const next = new Set(prev);
      (group.members || []).forEach(m => next.delete(m.id));
      return next;
    });
  }

  function describe(names) {
    const shown = names.slice(0, NAMES_IN_CONFIRM);
    const rest = names.length - shown.length;
    const list = shown.map(name => `• ${name}`).join('\n');
    return rest > 0 ? `${list}\n• ...and ${rest} more` : list;
  }

  async function handleTrash() {
    const ids = Array.from(selected);
    if (ids.length === 0 || busy) return;

    const names = ids.map(id => {
      const member = byId.get(id);
      if (!member) return `Job #${id}`;
      const date = formatDate(member.lastDate);
      return date ? `${member.postName} (last date ${date})` : member.postName;
    });

    const noun = ids.length === 1 ? 'posting' : 'postings';
    const ok = confirm(
      `Move ${ids.length} ${noun} to the trash?\n\n`
      + `${describe(names)}\n\n`
      + 'The oldest copy of each is kept, so no web address that is already '
      + 'shared or indexed will break. Nothing is erased -- you can put these '
      + 'back from the Trash screen.'
    );
    if (!ok) return;

    setBusy(true);
    setNotice('');
    try {
      const result = await trashJobs(ids);
      const done = result.changed === 1 ? 'posting' : 'postings';
      setNotice(
        result.skipped > 0
          ? `Moved ${result.changed} of ${result.requested} to the trash. ${result.skipped} were already gone.`
          : `Moved ${result.changed} ${done} to the trash.`
      );
      setReloadToken(n => n + 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminGuard>
      <div>
        <Header />
        <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
          <AdminNav />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h1 style={{ margin: 0 }}>
              Find duplicates
              {!loading && !error && (
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'}
                  {repeatGroupCount > 0 && `, ${repeatGroupCount} with a same-date repeat`}
                </span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/admin/trash" className="btn-ghost">Trash</Link>
              <Link href="/admin/manage" className="btn-ghost">Back to jobs</Link>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              Postings below share a post name and an organization. That on its
              own is normal — the same exam runs every year — so only the copies
              that <strong>also share a last date</strong> are marked
              <span className="pill pill-red" style={{ margin: '0 4px' }}>same notification</span>
              and ticked for you. Those are the ones that are almost certainly
              the same notification entered twice.
            </p>
            <p style={{ margin: 0 }}>
              The oldest copy in each group is always kept, because its web
              address is the one already shared and indexed by Google.
            </p>
          </div>

          {error && <p className="pill-red" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{error}</p>}
          {notice && <p className="pill-green" style={{ padding: '10px 14px', borderRadius: 8, marginTop: 16 }}>{notice}</p>}
          {loading && <p className="muted" style={{ marginTop: 16 }}>Scanning for duplicates…</p>}

          {!loading && !error && groups.length > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyRepeats} onChange={e => setOnlyRepeats(e.target.checked)} />
              <span>Only show groups with a same-date repeat</span>
            </label>
          )}

          {!loading && !error && selected.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              marginTop: 16, padding: '10px 14px', borderRadius: 8,
              background: '#FFF6F6', border: '1px solid #E8C9C9',
              position: 'sticky', top: 8, zIndex: 5,
            }}>
              <strong>{selected.size} ticked for removal</strong>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSelected(new Set())} className="btn-ghost" disabled={busy}>
                Untick all
              </button>
              <button onClick={handleTrash} disabled={busy}
                      style={{
                        background: '#A32D2D', color: '#fff', border: 'none',
                        padding: '8px 14px', borderRadius: 6, fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}>
                {busy ? 'Moving…' : `Move ${selected.size} to trash`}
              </button>
            </div>
          )}

          {!loading && !error && groups.length === 0 && (
            <p className="muted" style={{ marginTop: 24 }}>
              No duplicates found. Every live posting has a different post name
              or organization.
            </p>
          )}

          {!loading && !error && groups.length > 0 && visible.length === 0 && (
            <p className="muted" style={{ marginTop: 24 }}>
              None of the {groups.length} groups contain a same-date repeat.
              Untick the filter above to review them anyway.
            </p>
          )}

          {!loading && !error && visible.map(group => (
            <div key={group.key} style={{
              marginTop: 20, border: '1px solid var(--line, #E2E2E2)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                padding: '10px 14px', background: '#FAFAFA',
                borderBottom: '1px solid var(--line, #E2E2E2)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{group.postName}</strong>
                  {group.organization && (
                    <span className="muted"> — {group.organization}</span>
                  )}
                  <div className="muted" style={{ fontSize: '0.82rem' }}>
                    {group.count} postings
                    {group.hasExactRepeat
                      ? ' · contains a same-date repeat'
                      : ' · different last dates, probably different years'}
                  </div>
                </div>
                <span style={{ flex: 1 }} />
                <button className="btn-ghost" onClick={() => selectGroupExceptFirst(group)} disabled={busy}>
                  Tick all but oldest
                </button>
                <button className="btn-ghost" onClick={() => clearGroup(group)} disabled={busy}>
                  Untick group
                </button>
              </div>

              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Post name</th>
                      <th>Advt. no</th>
                      <th style={{ color: 'var(--red)' }}>Last date</th>
                      <th>Added</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.members || []).map((member, index) => {
                      const ticked = selected.has(member.id);
                      return (
                        <tr key={member.id} style={ticked ? { background: '#FFF9F9' } : undefined}>
                          <td>
                            <input type="checkbox"
                                   aria-label={`Select ${member.postName}`}
                                   checked={ticked}
                                   onChange={() => toggleOne(member.id)} />
                          </td>
                          <td>
                            {member.postName}
                            {index === 0 && (
                              <span className="pill pill-green" style={{ marginLeft: 8 }}>oldest — keep</span>
                            )}
                            {member.exactRepeat && (
                              <span className="pill pill-red" style={{ marginLeft: 8 }}>same notification</span>
                            )}
                            <div className="muted" style={{ fontSize: '0.8rem' }}>
                              #{member.id} · {categoryLabel(member.category)}
                            </div>
                          </td>
                          <td className="muted">{member.advertisementNo || '—'}</td>
                          <td style={{ color: 'var(--red)', fontWeight: 600 }}>{formatDate(member.lastDate) || '—'}</td>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatWhen(member.createdAt)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {/* target=_blank so checking a posting does not lose
                                the ticks built up on this screen. */}
                            <a href={jobHref(member)} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12 }}>
                              View
                            </a>
                            <Link href={`/admin/edit-job/${member.id}`}>Edit</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <Footer />
      </div>
    </AdminGuard>
  );
}
