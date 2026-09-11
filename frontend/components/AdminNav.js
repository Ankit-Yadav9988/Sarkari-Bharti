import Link from 'next/link';
import { useRouter } from 'next/router';

// Sub-navigation shown at the top of every admin screen so the admin can move
// between the content types. Nine tabs is a lot, but the alternative — a nested
// menu — costs a click on every single edit, and .admin-nav wraps to a second row
// rather than overflowing.
const LINKS = [
  { href: '/admin/manage', label: 'Jobs', isActive: r => r.pathname.startsWith('/admin/manage') || r.pathname.startsWith('/admin/add-job') || r.pathname.startsWith('/admin/edit-job') || r.pathname.startsWith('/admin/import') },
  { href: '/admin/notices?type=ADMIT_CARD', label: 'Admit cards', isActive: r => r.pathname.startsWith('/admin/notices') && r.query.type === 'ADMIT_CARD' },
  { href: '/admin/notices?type=RESULT', label: 'Results', isActive: r => r.pathname.startsWith('/admin/notices') && r.query.type === 'RESULT' },
  { href: '/admin/notices?type=ANSWER_KEY', label: 'Answer keys', isActive: r => r.pathname.startsWith('/admin/notices') && r.query.type === 'ANSWER_KEY' },
  { href: '/admin/syllabi', label: 'Syllabus', isActive: r => r.pathname.startsWith('/admin/syllabi') },
  // startsWith, not equality: these three each have /new and /edit/[id] beneath them
  // and the tab has to stay lit while the admin is inside one of those forms.
  { href: '/admin/cutoffs', label: 'Cut offs', isActive: r => r.pathname.startsWith('/admin/cutoffs') },
  { href: '/admin/exam-calendar', label: 'Calendar', isActive: r => r.pathname.startsWith('/admin/exam-calendar') },
  { href: '/admin/papers', label: 'Papers', isActive: r => r.pathname.startsWith('/admin/papers') },
  { href: '/admin/subscribers', label: 'Subscribers', isActive: r => r.pathname === '/admin/subscribers' },
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
