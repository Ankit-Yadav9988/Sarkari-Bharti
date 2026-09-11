import Link from 'next/link';

// Scrolling headline strip under the nav. On this kind of portal the ticker
// is genuinely useful, not decoration: it answers "what changed since I last
// checked?" without the user opening a single page.
//
// items: [{ href, label }]
export default function Ticker({ items = [], label = 'BREAKING' }) {
  if (!items.length) return null;

  // The track is rendered twice so the loop has no visible gap.
  const run = [...items, ...items];

  return (
    <div className="ticker">
      <div className="ticker-label">{label}</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {run.map((item, i) => (
            <Link key={`${item.href}-${i}`} href={item.href} aria-hidden={i >= items.length}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
