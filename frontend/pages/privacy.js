import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import { SITE } from '../lib/site';

const EFFECTIVE_DATE = '1 August 2025';

export default function Privacy() {
  return (
    <div>
      <SeoHead title="Privacy Policy" description={`Privacy policy for ${SITE.name}.`} canonical="/privacy" noIndex />
      <Header />
      <div className="container" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 720 }}>
        <h1>Privacy Policy</h1>
        <p className="muted small">Effective date: {EFFECTIVE_DATE}</p>

        <h2>1. Information we collect</h2>
        <p>{SITE.name} does not require you to create an account. We do not collect your name, email, or personal details unless you voluntarily submit them via the Contact form.</p>
        <p>We use standard server logs (IP address, browser type, pages visited) for security and performance monitoring. These are not sold or shared with third parties.</p>

        <h2>2. Cookies and advertising</h2>
        <p>We use Google AdSense to display advertisements. Google may use cookies to serve ads based on your prior visits to this and other websites. You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ad Settings</a>.</p>

        <h2>3. Third-party links</h2>
        <p>Job listings link to official government and company websites. We are not responsible for the privacy practices of those sites.</p>

        <h2>4. Data retention</h2>
        <p>Contact form submissions are retained only as long as necessary to respond to your enquiry and are then deleted.</p>

        <h2>5. Your rights</h2>
        <p>You may request deletion of any personal data you submitted via the Contact form by writing to us through the same form.</p>

        <h2>6. Changes to this policy</h2>
        <p>We may update this policy from time to time. The effective date at the top of this page will reflect the latest revision.</p>

        <h2>7. Contact</h2>
        <p>Questions about this policy? Use our <a href="/contact">Contact page</a>.</p>
      </div>
      <Footer />
    </div>
  );
}
