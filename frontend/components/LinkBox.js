import Link from 'next/link';

// A coloured section box: the repeating unit of the homepage grid.
// Each content type owns a colour so regulars navigate by colour, and the
// "View all" link is duplicated top and bottom because on a long box the
// header scrolls out of reach on phones.
//
// accent: any CSS colour (see --c-* tokens in globals.css)
export default function LinkBox({ title, accent, viewAllHref, viewAllLabel = 'View all', children, empty }) {
  const hasChildren = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;

  return (
    <section className="box">
      <div className="box-head" style={{ background: accent }}>
        <span>{title}</span>
        {viewAllHref && <Link href={viewAllHref}>{viewAllLabel} →</Link>}
      </div>

      <div className="box-body">
        {hasChildren
          ? <div className="linklist">{children}</div>
          : <p className="linklist-empty">{empty}</p>}
      </div>

      {viewAllHref && hasChildren && (
        <div className="box-foot">
          <Link href={viewAllHref}>{viewAllLabel} →</Link>
        </div>
      )}
    </section>
  );
}
