// The landing pages: /ssc-jobs, /railway-jobs, /uttar-pradesh-jobs, and so on.
//
// Why these exist as their own URLs rather than as /jobs?category=SSC:
// almost all of the search traffic in this category is a query like "ssc jobs
// 2026" or "up police vacancy", and a filtered view of a generic listing page
// does not rank for those. A crawler treats ?category=SSC as a variant of
// /jobs -- often not indexing it at all -- while /ssc-jobs is a page about SSC
// jobs, with the words in the URL, the title, the H1 and the intro paragraph.
//
// They are generated from the category and state lists rather than hand-written
// so that adding a state to STATES adds its landing page, and a page can never
// point at a filter value the backend does not recognise.

import { CATEGORIES, STATES, categoryLabel } from './api';

/** "Jammu & Kashmir" -> "jammu-kashmir" */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '');
}

/**
 * The URL for each category. Hand-written rather than slugified from the label,
 * because the label is what reads best in a dropdown and the slug is what people
 * type into a search box, and those are not always the same string: nobody
 * searches "central-govt-jobs".
 */
const CATEGORY_SLUGS = {
  CENTRAL_GOVT: 'central-government-jobs',
  UPSC:         'upsc-jobs',
  SSC:          'ssc-jobs',
  NTA:          'nta-exams',
  STATE_GOVT:   'state-government-jobs',
  STATE_PSC:    'state-psc-jobs',
  BANKING:      'bank-jobs',
  RAILWAY:      'railway-jobs',
  DEFENCE:      'defence-jobs',
  POLICE:       'police-jobs',
  TEACHING:     'teaching-jobs',
  PSU:          'psu-jobs',
  ADMISSION:    'admission-forms',
};

/**
 * A sentence of real copy per category, in both languages.
 *
 * Not padding: a landing page whose only content is a list of links is a thin
 * page, and thin pages are what "created solely for search engines" means in
 * Google's own wording. One accurate paragraph naming the actual recruiting
 * bodies is also the thing that tells a visitor they are in the right place.
 *
 * The Hindi is written, not transliterated. "Staff Selection Commission" stays
 * in English inside the Hindi copy where that is what the exam is actually
 * called in conversation — "कर्मचारी चयन आयोग (SSC)" is how someone preparing
 * for it refers to it, and dropping the abbreviation would make the page harder
 * to recognise, not more Hindi.
 */
const CATEGORY_INTROS = {
  CENTRAL_GOVT: {
    en: 'Vacancies across central government ministries, departments and autonomous bodies — including direct recruitment and deputation notifications.',
    hi: 'केंद्र सरकार के मंत्रालयों, विभागों और स्वायत्त संस्थानों की भर्तियाँ — सीधी भर्ती और प्रतिनियुक्ति दोनों के नोटिफ़िकेशन शामिल हैं।',
  },
  UPSC: {
    en: 'Union Public Service Commission notifications: Civil Services (IAS/IPS/IFS), Engineering Services, CDS, NDA, CMS and the combined recruitment advertisements.',
    hi: 'संघ लोक सेवा आयोग (UPSC) के नोटिफ़िकेशन: सिविल सेवा (IAS/IPS/IFS), इंजीनियरिंग सेवा, CDS, NDA, CMS और संयुक्त भर्ती विज्ञापन।',
  },
  SSC: {
    en: 'Staff Selection Commission recruitment: CGL, CHSL, MTS, GD Constable, Stenographer, JE and Selection Post notifications with tier-wise exam dates.',
    hi: 'कर्मचारी चयन आयोग (SSC) की भर्तियाँ: CGL, CHSL, MTS, GD कांस्टेबल, स्टेनोग्राफर, JE और सिलेक्शन पोस्ट — टियर-वार परीक्षा तिथियों के साथ।',
  },
  NTA: {
    en: 'National Testing Agency exams — JEE Main, NEET, UGC NET, CUET and CMAT — with application windows, city slips and admit card releases.',
    hi: 'राष्ट्रीय परीक्षा एजेंसी (NTA) की परीक्षाएँ — JEE Main, NEET, UGC NET, CUET और CMAT — आवेदन की तिथियाँ, सिटी स्लिप और एडमिट कार्ड की जानकारी।',
  },
  STATE_GOVT: {
    en: 'Recruitment by state government departments and boards, from clerical and technical posts to state-level group C and group D vacancies.',
    hi: 'राज्य सरकार के विभागों और बोर्डों की भर्तियाँ — लिपिक और तकनीकी पदों से लेकर राज्य स्तरीय ग्रुप C और ग्रुप D की रिक्तियाँ।',
  },
  STATE_PSC: {
    en: 'State Public Service Commission notifications — BPSC, UPPSC, MPPSC, RPSC, MPSC and others — covering combined and departmental examinations.',
    hi: 'राज्य लोक सेवा आयोगों के नोटिफ़िकेशन — BPSC, UPPSC, MPPSC, RPSC, MPSC आदि — संयुक्त और विभागीय परीक्षाओं सहित।',
  },
  BANKING: {
    en: 'Bank recruitment through IBPS, SBI and RBI: Probationary Officer, Clerk, Specialist Officer, Grade B and apprentice notifications.',
    hi: 'IBPS, SBI और RBI के ज़रिए बैंक भर्तियाँ: प्रोबेशनरी ऑफिसर (PO), क्लर्क, स्पेशलिस्ट ऑफिसर, ग्रेड B और अप्रेंटिस के नोटिफ़िकेशन।',
  },
  RAILWAY: {
    en: 'Indian Railways vacancies via RRB and RRC — NTPC, Group D, ALP, Technician, JE and apprentice recruitment across all zones.',
    hi: 'RRB और RRC के माध्यम से भारतीय रेलवे की भर्तियाँ — NTPC, ग्रुप D, ALP, टेक्नीशियन, JE और अप्रेंटिस — सभी ज़ोन की रिक्तियाँ।',
  },
  DEFENCE: {
    en: 'Armed forces and paramilitary recruitment: Indian Army, Navy, Air Force, Coast Guard, BSF, CRPF, CISF, ITBP and Assam Rifles.',
    hi: 'सेना और अर्धसैनिक बलों की भर्ती: भारतीय थल सेना, नौसेना, वायु सेना, तटरक्षक बल, BSF, CRPF, CISF, ITBP और असम राइफल्स।',
  },
  POLICE: {
    en: 'State police recruitment — Constable, Sub-Inspector, Head Constable and driver posts — with physical and written test schedules.',
    hi: 'राज्य पुलिस भर्ती — कांस्टेबल, सब-इंस्पेक्टर, हेड कांस्टेबल और चालक पद — शारीरिक और लिखित परीक्षा की तिथियों के साथ।',
  },
  TEACHING: {
    en: 'Teaching and academic vacancies: TET/CTET-linked posts, primary and secondary teacher recruitment, lecturer, professor and KVS/NVS notifications.',
    hi: 'शिक्षक और शैक्षणिक पदों की भर्तियाँ: TET/CTET से जुड़े पद, प्राथमिक और माध्यमिक शिक्षक भर्ती, प्रवक्ता, प्रोफेसर तथा KVS/NVS के नोटिफ़िकेशन।',
  },
  PSU: {
    en: 'Public sector undertaking recruitment — ONGC, NTPC, BHEL, SAIL, IOCL, GAIL and others — for engineer, executive and technician grades.',
    hi: 'सार्वजनिक उपक्रमों (PSU) की भर्तियाँ — ONGC, NTPC, BHEL, SAIL, IOCL, GAIL आदि — इंजीनियर, एग्जीक्यूटिव और टेक्नीशियन ग्रेड के पद।',
  },
  ADMISSION: {
    en: 'University and entrance-exam admission forms, counselling schedules and last dates for undergraduate, postgraduate and diploma programmes.',
    hi: 'विश्वविद्यालय और प्रवेश परीक्षा के एडमिशन फॉर्म, काउंसलिंग शेड्यूल तथा स्नातक, परास्नातक और डिप्लोमा कोर्सों की अंतिम तिथियाँ।',
  },
};

/** Category names in Hindi, for the H1 and the sibling chips. */
const CATEGORY_NAMES_HI = {
  CENTRAL_GOVT: 'केंद्र सरकार',
  UPSC: 'UPSC',
  SSC: 'SSC',
  NTA: 'NTA',
  STATE_GOVT: 'राज्य सरकार',
  STATE_PSC: 'राज्य PSC',
  BANKING: 'बैंकिंग',
  RAILWAY: 'रेलवे',
  DEFENCE: 'रक्षा',
  POLICE: 'पुलिस',
  TEACHING: 'शिक्षक',
  PSU: 'PSU',
  ADMISSION: 'एडमिशन',
};

/**
 * State and UT names in Hindi. Kept here rather than in the i18n dictionary
 * because they are data, not interface copy: the same list drives the slugs,
 * the headings and the chip grid, and a name missing from one of those but not
 * the others is the bug this avoids.
 */
const STATE_NAMES_HI = {
  'Andhra Pradesh': 'आंध्र प्रदेश',
  'Arunachal Pradesh': 'अरुणाचल प्रदेश',
  'Assam': 'असम',
  'Bihar': 'बिहार',
  'Chhattisgarh': 'छत्तीसगढ़',
  'Delhi': 'दिल्ली',
  'Goa': 'गोवा',
  'Gujarat': 'गुजरात',
  'Haryana': 'हरियाणा',
  'Himachal Pradesh': 'हिमाचल प्रदेश',
  'Jammu & Kashmir': 'जम्मू और कश्मीर',
  'Jharkhand': 'झारखंड',
  'Karnataka': 'कर्नाटक',
  'Kerala': 'केरल',
  'Madhya Pradesh': 'मध्य प्रदेश',
  'Maharashtra': 'महाराष्ट्र',
  'Manipur': 'मणिपुर',
  'Meghalaya': 'मेघालय',
  'Mizoram': 'मिज़ोरम',
  'Nagaland': 'नागालैंड',
  'Odisha': 'ओडिशा',
  'Punjab': 'पंजाब',
  'Rajasthan': 'राजस्थान',
  'Sikkim': 'सिक्किम',
  'Tamil Nadu': 'तमिलनाडु',
  'Telangana': 'तेलंगाना',
  'Tripura': 'त्रिपुरा',
  'Uttar Pradesh': 'उत्तर प्रदेश',
  'Uttarakhand': 'उत्तराखंड',
  'West Bengal': 'पश्चिम बंगाल',
};

/**
 * The English H1, templated as `${label} Jobs` except where that is factually
 * wrong. Two are:
 *
 *   NTA — conducts exams, it does not recruit. The slug is already `nta-exams`
 *   for that reason, and a page whose URL says exams and whose heading says
 *   jobs contradicts itself for both the reader and the crawler.
 *
 *   ADMISSION — an admission notice is a form, not a vacancy. "Admission Jobs"
 *   is the sort of phrase a template writes and a person never would.
 *
 * The Hindi table below overrides both already; this exists so the two
 * languages describe the same page the same way.
 */
const CATEGORY_HEADINGS_EN = {
  NTA:       'NTA Exams',
  ADMISSION: 'Admission Forms',
};

/**
 * The H1 in Hindi, written per category rather than templated.
 *
 * Templating it — `${hindiName} भर्तियाँ` — produces "केंद्र सरकार भर्तियाँ",
 * which is missing the postposition, and "NTA भर्तियाँ", which is wrong because
 * NTA does not recruit, it conducts exams. Hindi will not survive string
 * concatenation off an English label, so each one is written out.
 */
const CATEGORY_HEADINGS_HI = {
  CENTRAL_GOVT: 'केंद्र सरकार की भर्तियाँ',
  UPSC:         'UPSC भर्तियाँ',
  SSC:          'SSC भर्तियाँ',
  NTA:          'NTA परीक्षाएँ',
  STATE_GOVT:   'राज्य सरकार की भर्तियाँ',
  STATE_PSC:    'राज्य PSC भर्तियाँ',
  BANKING:      'बैंक भर्तियाँ',
  RAILWAY:      'रेलवे भर्तियाँ',
  DEFENCE:      'सेना और रक्षा भर्तियाँ',
  POLICE:       'पुलिस भर्तियाँ',
  TEACHING:     'शिक्षक भर्तियाँ',
  PSU:          'PSU भर्तियाँ',
  ADMISSION:    'एडमिशन फॉर्म',
};

function categoryLanding(category) {
  const slug = CATEGORY_SLUGS[category.value];
  if (!slug) return null;

  // The year is what people actually type — "ssc jobs 2026" — and reading it
  // from the clock keeps the title current without an annual edit. Evaluated
  // once at module load, which on a server that is redeployed more often than
  // once a year is close enough, and the pages are server-rendered anyway.
  const year = new Date().getFullYear();

  const nameEn = category.label;
  const nameHi = CATEGORY_NAMES_HI[category.value] || category.label;
  const headingEn = CATEGORY_HEADINGS_EN[category.value] || `${nameEn} Jobs`;
  const headingHi = CATEGORY_HEADINGS_HI[category.value] || `${nameHi} भर्तियाँ`;

  return {
    slug,
    kind: 'category',
    filter: { category: category.value },
    name:    { en: nameEn,    hi: nameHi },
    heading: { en: headingEn, hi: headingHi },
    title:   { en: `${headingEn} ${year}`, hi: `${headingHi} ${year}` },
    intro: CATEGORY_INTROS[category.value] || {
      en: `Latest ${nameEn} recruitment notifications with eligibility, fees and important dates.`,
      hi: `${nameHi} की ताज़ा भर्तियाँ — योग्यता, शुल्क और महत्वपूर्ण तिथियों के साथ।`,
    },
    accent: 'var(--c-latest)',
  };
}

function stateLanding(state) {
  const year = new Date().getFullYear();
  const nameHi = STATE_NAMES_HI[state] || state;
  const headingEn = `${state} Government Jobs`;
  const headingHi = `${nameHi} सरकारी नौकरी`;

  return {
    slug: `${slugify(state)}-jobs`,
    kind: 'state',
    filter: { state },
    name:    { en: state,     hi: nameHi },
    heading: { en: headingEn, hi: headingHi },
    title:   { en: `${headingEn} ${year}`, hi: `${headingHi} ${year}` },
    intro: {
      en: `Sarkari naukri in ${state} — state government departments, boards, police and teaching recruitment, plus all-India vacancies with posting in ${state}.`,
      hi: `${nameHi} में सरकारी नौकरी — राज्य सरकार के विभाग, बोर्ड, पुलिस और शिक्षक भर्ती, तथा ${nameHi} में पोस्टिंग वाली अखिल भारतीय रिक्तियाँ।`,
    },
    accent: 'var(--c-upcoming)',
  };
}

/** slug -> landing definition. Built once at module load. */
export const LANDINGS = Object.freeze(
  Object.fromEntries(
    [
      ...CATEGORIES.map(categoryLanding).filter(Boolean),
      ...STATES.map(stateLanding),
    ].map(l => [l.slug, l])
  )
);

/**
 * Flatten one landing's bilingual fields for a locale.
 *
 * The landing object travels from getServerSideProps to the browser as JSON, so
 * it holds both languages rather than a pre-resolved string: resolving on the
 * server would mean the same page could not re-render in the other language
 * after a client-side navigation, and it would put the wrong text in the props
 * of a page the CDN then caches.
 *
 * Falls back to English per field, not per object, so a category added with only
 * English copy renders English words in a Hindi page instead of blanking a
 * heading. Also tolerates a plain string, which is what these fields were
 * before they became bilingual — a cached page from an older build hydrating
 * against this code must not throw.
 */
export function landingText(landing, lang = 'en') {
  const pick = v => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return v[lang] ?? v.en ?? '';
  };
  return {
    name:    pick(landing?.name),
    heading: pick(landing?.heading),
    title:   pick(landing?.title),
    intro:   pick(landing?.intro),
  };
}

export function findLanding(slug) {
  if (typeof slug !== 'string') return null;
  return LANDINGS[slug.toLowerCase()] || null;
}

/** Every landing path, for the sitemap and the footer link grid. */
export function landingPaths() {
  return Object.keys(LANDINGS).map(slug => `/${slug}`);
}

export function categoryLandings() {
  return Object.values(LANDINGS).filter(l => l.kind === 'category');
}

export function stateLandings() {
  return Object.values(LANDINGS).filter(l => l.kind === 'state');
}

/** The landing page for one category/state value, when one exists. */
export function landingForCategory(value) {
  return Object.values(LANDINGS).find(l => l.kind === 'category' && l.filter.category === value) || null;
}

export function landingForState(value) {
  return Object.values(LANDINGS).find(l => l.kind === 'state' && l.filter.state === value) || null;
}

/**
 * A category enum value written in the reader's language.
 *
 * This one line was copy-pasted into five files — the filter bar and four listing
 * pages — which is four chances for a Hindi page to call the same department
 * something different in its chips than in its rows. categoryLabel() alone is
 * wrong here: it returns the English admin-dropdown label, which is the wrong
 * string on a /hi page. The landing copy is the written translation, and every
 * category has a landing, so the fallback is only reached if one is ever added
 * without one.
 */
export function categoryName(value, lang = 'en') {
  if (!value) return '';
  return landingText(landingForCategory(value), lang).name || categoryLabel(value);
}
