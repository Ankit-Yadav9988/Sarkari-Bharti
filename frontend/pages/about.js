import Header from '../components/Header';
import Footer from '../components/Footer';
import SeoHead from '../components/SeoHead';
import { SITE } from '../lib/site';

export default function About() {
  return (
    <div>
      <SeoHead
        title="About Us"
        description={`What ${SITE.name} is, where its listings come from, and how each vacancy, result and admit card is checked against the department's own notification before it goes up.`}
        canonical="/about"
      />
      <Header />
      <div className="container" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 720 }}>
        <h1>About {SITE.name}</h1>
        <p>{SITE.name} is an independent job portal that aggregates government and private job notifications across India. Our goal is to make it easy for every job seeker — from 10th pass to postgraduate — to find the right vacancy in one place.</p>
        <h2>What we cover</h2>
        <ul>
          <li>Central and state government job notifications</li>
          <li>PSU, banking, railway, and defence recruitments</li>
          <li>Admit card and result updates</li>
          <li>Private sector openings</li>
        </ul>
        <h2>Disclaimer</h2>
        <p>{SITE.name} is not affiliated with any government body, ministry, or recruiting organisation. All information is sourced from official notifications and is provided for informational purposes only. Always verify details on the official website before applying.</p>
        <h2>Contact</h2>
        <p>For corrections, suggestions, or partnership enquiries, please use the <a href="/contact">Contact page</a>.</p>
      </div>
      <Footer />
    </div>
  );
}
