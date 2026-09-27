import Link from 'next/link';
import { useRouter } from 'next/router';

// The notice screens are all scoped to one type, carried in the query string —
// including the importer, so that landing on it from the Results page keeps the
// Results tab lit rather than dropping the admin out of the section they are in.
const noticeTabActive = (r, type) =>
  (r.pathname.startsWith('/admin/notices') || r.pathname === '/admin/import-notices')
  && r.query.type === type;

// Every screen that belongs to the Jobs section, so the tab stays lit while the
// admin is inside one of them.
//
// The prefix matches cover the forms that live beneath a screen
// (/admin/edit-job/5). The exact matches are exact on purpose: there are two
// importers whose paths share a prefix, so `startsWith('/admin/import')` would
// light Jobs while the admin is on the results importer. The same trap is
// waiting for any future /admin/trash-something, which is why the housekeeping
// screens are matched by equality too.
const jobsTabActive = r =>
  r.pathname.startsWith('/admin/manage')
  || r.pathname.startsWith('/admin/add-job')
  || r.pathname.startsWith('/admin/edit-job')
  || r.pathname === '/admin/import'
  || r.pathname === '/admin/trash'
  || r.pathname === '/admin/duplicates';

// Sub-navigation shown at the top of every admin screen so the admin can move
// between the content types. Nine tabs is a lot, but the alternative — a nested
// menu — costs a click on every single edit, and .admin-nav wraps to a second row
// rather than overflowing.
// The trash and duplicate-finder screens deliberately do not get tabs of their
// own: they are reached from the header of the Jobs screen, because a tenth and
// eleventh tab would cost every other screen a row of height to surface two
// links that are only wanted while working through the job queue.
const LINKS = [
  { href: '/admin/manage', label: 'Jobs', isActive: jobsTabActive },
  { href: '/admin/notices?type=ADMIT_CARD', label: 'Admit cards', isActive: r => noticeTabActive(r, 'ADMIT_CARD') },
  { href: '/admin/notices?type=RESULT', label: 'Results', isActive: r => noticeTabActive(r, 'RESULT') },
  { href: '/admin/notices?type=ANSWER_KEY', label: 'Answer keys', isActive: r => noticeTabActive(r, 'ANSWER_KEY') },
  { href: '/admin/syllabi', label: 'Syllabus', isActive: r => r.pathname.startsWith('/admin/syllabi') },
  // startsWith, not equality: these three each have /new and /edit/[id] beneath them
  // and the tab has to stay lit while the admin is inside one of those forms.
  { href: '/admin/cutoffs', label: 'Cut offs', isActive: r => r.pathname.startsWith('/admin/cutoffs') },
  { href: '/admin/exam-calendar', label: 'Calendar', isActive: r => r.pathname.startsWith('/admin/exam-calendar') },
  { href: '/admin/papers', label: 'Papers', isActive: r => r.pathname.startsWith('/admin/papers') },
  { href: '/admin/subscribers', label: 'Subscribers', isActive: r => r.pathname === '/admin/subscribers' || r.pathname === '/admin/send-alert' },
];

export default function AdminNav() {
  const router = useRouter();
  return (
    <div className="admin-nav">
      {LINKS.map(link => (
        <Link key={link.label} href={link.href} className={link.isActive(router) ? 'active' : ''}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
