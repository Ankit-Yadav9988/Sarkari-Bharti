import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import { useLang } from '../lib/i18n';

// Job URLs get forwarded on WhatsApp for months after a posting is removed,
// so this page gets real traffic. It routes people onward instead of
// dead-ending them.
//
// It is translated for the same reason: the visitor who lands here followed a
// dead link from a Hindi page, and an English apology is a second dead end.
export default function NotFound() {
  const { t } = useLang();
  return (
    <div>
      <SeoHead title={t('notfound.title')} noIndex />
      <Header />
      <div className="container" style={{ paddingTop: 10, paddingBottom: 20 }}>
        <div className="page-head">
          <h1>{t('notfound.title')}</h1>
          <p>{t('notfound.body')}</p>
        </div>

        <div className="panel">
          <div className="panel-head">{t('notfound.tryThese')}</div>
          <div className="linklist">
            <Link href="/latest-jobs" className="linklist-item">
              <span className="linklist-title">{t('nav.latest')}</span>
              <span className="linklist-meta">{t('notfound.metaLatest')}</span>
            </Link>
            <Link href="/result" className="linklist-item">
              <span className="linklist-title">{t('nav.result')}</span>
              <span className="linklist-meta">{t('notfound.metaResult')}</span>
            </Link>
            <Link href="/admit-card" className="linklist-item">
              <span className="linklist-title">{t('nav.admitCard')}</span>
              <span className="linklist-meta">{t('notfound.metaAdmit')}</span>
            </Link>
            <Link href="/jobs" className="linklist-item">
              <span className="linklist-title">{t('nav.all')}</span>
              <span className="linklist-meta">{t('notfound.metaAll')}</span>
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
