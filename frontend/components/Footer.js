import Link from 'next/link';
import { useLang } from '../lib/i18n';
import { SITE } from '../lib/site';

// Link-dense footer. On a portal like this the footer is a second navigation
// surface — crawlers and returning users both use it — so it carries every
// section rather than four legal links.
export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-cols">
          <div className="footer-col">
            <h4>Jobs</h4>
            <Link href="/latest-jobs">{t('nav.latest')}</Link>
            <Link href="/upcoming-jobs">{t('nav.upcoming')}</Link>
            <Link href="/jobs">{t('nav.all')}</Link>
            <Link href="/admission">{t('nav.admission')}</Link>
          </div>

          <div className="footer-col">
            <h4>Exams</h4>
            <Link href="/admit-card">{t('nav.admitCard')}</Link>
            <Link href="/result">{t('nav.result')}</Link>
            <Link href="/answer-key">{t('nav.answerKey')}</Link>
            <Link href="/syllabus">{t('nav.syllabus')}</Link>
          </div>

          <div className="footer-col">
            <h4>Prepare</h4>
            <Link href="/cut-off">{t('nav.cutOff')}</Link>
            <Link href="/exam-calendar">{t('nav.examCalendar')}</Link>
            <Link href="/previous-year-papers">{t('nav.papers')}</Link>
          </div>

          <div className="footer-col">
            <h4>Popular</h4>
            <Link href="/ssc-jobs">SSC jobs</Link>
            <Link href="/railway-jobs">Railway jobs</Link>
            <Link href="/bank-jobs">Bank jobs</Link>
            <Link href="/police-jobs">Police jobs</Link>
            <Link href="/defence-jobs">Defence jobs</Link>
            <Link href="/upsc-jobs">UPSC jobs</Link>
          </div>

          <div className="footer-col">
            <h4>By state</h4>
            <Link href="/uttar-pradesh-jobs">Uttar Pradesh</Link>
            <Link href="/bihar-jobs">Bihar</Link>
            <Link href="/rajasthan-jobs">Rajasthan</Link>
            <Link href="/madhya-pradesh-jobs">Madhya Pradesh</Link>
            <Link href="/maharashtra-jobs">Maharashtra</Link>
            <Link href="/delhi-jobs">Delhi</Link>
          </div>

          <div className="footer-col">
            <h4>Site</h4>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/disclaimer">Disclaimer</Link>
            <Link href="/privacy">Privacy policy</Link>
          </div>
        </div>

        <div className="footer-legal">
          © {new Date().getFullYear()} {SITE.name} — {t('footer.disclaimer')}.<br />
          Always confirm details against the official notification before applying.
        </div>
      </div>
    </footer>
  );
}
