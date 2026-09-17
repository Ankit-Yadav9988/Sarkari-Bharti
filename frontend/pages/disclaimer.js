import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import { SITE } from '../lib/site';

export default function Disclaimer() {
  return (
    <div>
      {/* Indexable — same reasoning as /privacy, and it applies harder here. This
          page is where the site says plainly that it is not a government body and
          that the department's own notification is the authority. That is the
          single most important thing a visitor arriving from a search for
          "sarkari result" could be told, and it was marked noindex while sitting
          in sitemap.xml. */}
      <SeoHead
        title="Disclaimer"
        description={`${SITE.name} is a private information website and is not affiliated with any government department. Always confirm details from the official notification before applying.`}
        canonical="/disclaimer"
      />
      <Header />
      <div className="container" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 720 }}>
        <h1>Disclaimer</h1>

        <h2>Not an official government website</h2>
        <p>{SITE.name} is an independent, privately operated job information portal. It is <strong>not</strong> affiliated with, endorsed by, or connected to any government ministry, department, public sector undertaking, or recruiting body.</p>

        <h2>Accuracy of information</h2>
        <p>We strive to keep all job notifications, dates, and links accurate and up to date. However, we cannot guarantee the completeness or accuracy of information sourced from official notifications. Recruitment rules, dates, and eligibility criteria can change without notice.</p>
        <p><strong>Always verify all details — including last dates, eligibility, and fee — directly on the official website of the recruiting organisation before applying.</strong></p>

        <h2>No liability</h2>
        <p>{SITE.name} shall not be held liable for any loss, damage, or inconvenience arising from reliance on information published on this site. Use of this site is at your own risk.</p>

        <h2>External links</h2>
        <p>This site contains links to external websites (official apply portals, notification PDFs). We have no control over the content or availability of those sites and accept no responsibility for them.</p>

        <h2>Copyright</h2>
        <p>Job notification content (post names, eligibility, dates) is sourced from publicly available official notifications and is reproduced for informational purposes. If you believe any content infringes your rights, please contact us via the <a href="/contact">Contact page</a>.</p>
      </div>
      <Footer />
    </div>
  );
}
