// Hindi/English strings - no library needed.
//
// Usage:  const { t, lang, otherLang } = useLang();   then   t('nav.home')
//
// The language is read from the URL, not from state. Next's i18n routing serves
// English at /result and Hindi at /hi/result, so router.locale is already
// correct on the server and on the first client render — there is no flip after
// mount to avoid, and no hydration mismatch to work around.
//
// This replaced a localStorage flag. That flag worked for a returning visitor
// and for nobody else: the Hindi text had no URL, so it could not be shared and
// Google never saw it. A remembered preference that silently redirects is also
// the wrong trade here — it makes every page a per-visitor redirect and breaks
// edge caching. The switch in the header navigates instead.

import { createContext, useContext } from 'react';
import { useRouter } from 'next/router';
import { LOCALES, DEFAULT_LOCALE } from './site';

// Re-exported so the many callers that already say
// `import { LOCALES } from '../lib/i18n'` keep working. The list itself lives
// in lib/site.js, which has no React dependency and can therefore be imported
// by pages/api/sitemap.js without pulling the renderer into an API route.
export { LOCALES, DEFAULT_LOCALE };

const STRINGS = {
  en: {
    'nav.home': 'Home',
    'nav.latest': 'Latest jobs',
    'nav.upcoming': 'Upcoming',
    'nav.all': 'All jobs',
    'nav.admitCard': 'Admit card',
    'nav.result': 'Result',
    'nav.answerKey': 'Answer key',
    'nav.syllabus': 'Syllabus',
    'nav.admission': 'Admission',
    // Short forms on purpose: these sit in a nav bar that already has nine
    // items. "Previous year question papers" is what the page is called; it is
    // not what fits in a menu.
    'nav.cutOff': 'Cut off',
    'nav.examCalendar': 'Exam calendar',
    'nav.papers': 'Old papers',

    'home.latest': 'Latest jobs',
    'home.upcoming': 'Upcoming jobs',
    'home.admitCard': 'Admit card',
    'home.result': 'Result',
    'home.viewAll': 'View all',
    'home.searchPlaceholder': 'Search post or organization…',
    'home.search': 'Search',
    'home.browseByCategory': 'Browse by category',

    'ticker.label': 'CLOSING SOON',
    'action.view': 'View',
    'action.download': 'Download',

    'row.start': 'Start',
    'row.last': 'Last',
    'row.opens': 'Opens',
    'row.lastDayToday': 'Last day today!',
    'row.daysLeft': '{n} days left',
    'row.dayLeft': '1 day left',
    'row.inDays': 'in {n} days',
    'row.inDay': 'in 1 day',
    'row.new': 'NEW',
    'row.posts': 'posts',
    'row.viewJob': 'View job',
    'row.released': 'Released',

    'status.open': 'Open',
    'status.upcoming': 'Upcoming',
    'status.closed': 'Closed',

    'job.applicationsOpen': 'Applications are open',
    'job.applicationsSoon': 'Applications open soon',
    'job.applicationsClosed': 'Applications closed',
    'job.apply': 'Apply on official site',
    'job.notificationPdf': 'Notification PDF',
    'job.syllabus': 'Syllabus',
    'job.importantDates': 'Important dates',
    'job.importantLinks': 'Important links',
    'job.latestUpdates': 'Latest updates',
    'job.applicationFee': 'Application fee',
    'job.ageRelaxation': 'Age relaxation',
    'job.eligibility': 'Eligibility',
    'job.selectionProcess': 'Selection process',
    'job.totalPosts': 'Total posts',
    'job.lastDate': 'Last date',
    'job.ageLimit': 'Age limit',
    'job.views': 'views',
    'job.share': 'Share this job',
    'job.advtNo': 'Advt. No.',
    'job.source': 'Source',
    'job.lastUpdated': 'Last updated',
    'job.years': 'yrs',
    'job.noFee': 'No fee',
    'job.plusYears': '+{n} years',

    // Headings for the related exam-content blocks on a job page, fetched off the
    // /for-job/{id} endpoints. Worded as what the reader gets, not as the table
    // they came out of: "Syllabus and exam pattern", not "Syllabi".
    'job.examSchedule': 'Exam schedule',
    'job.syllabusFor': 'Syllabus and exam pattern',
    'job.pastPapers': 'Previous year question papers',
    'job.pastCutOffs': 'Cut off marks (previous years)',
    'job.pastCutOffsNote': "From earlier cycles of this exam — not this year's cut off.",

    'job.dateStart': 'Application start',
    'job.dateLast': 'Last date to apply',
    'job.dateAdmit': 'Admit card (expected)',
    'job.dateExam': 'Exam date',
    'job.dateResult': 'Result (expected)',

    'job.applyOnline': 'Apply online',
    'job.officialNotification': 'Official notification',
    'job.clickHere': 'Click here',
    'job.downloadPdf': 'Download PDF',
    'job.viewSyllabus': 'View syllabus',
    'job.moreCategory': 'More {name} jobs',
    'job.allStateVacancies': 'All {state} vacancies',
    'job.browseAll': 'Browse all',
    'job.downloadAdmitCard': 'Download admit card',
    'job.viewResult': 'View result',
    'job.viewAnswerKey': 'View answer key',

    'page.latest.sub': 'Applications open right now — apply before the last date.',
    'page.upcoming.sub': 'Notification out, applications not open yet.',
    'page.all.sub': 'Every job on the site — open, upcoming and closed — filter by category below.',
    'page.all.title': 'All jobs',
    'page.searchResults': 'Search results for "{q}"',
    'page.prev': 'Prev',
    'page.next': 'Next',
    'chip.all': 'All',

    // <title> and meta description per page. These live in the dictionary
    // rather than inline in each page because the title is the one place the
    // translation has to show up for it to be worth having: a /hi/ page with an
    // English <title> is an English-looking result in the search listing, and
    // nobody searching in Hindi clicks it.
    // SeoHead's fallback, used by the homepage and by any page that passes no
    // title. It has to live in the dictionary rather than in the component: a
    // hardcoded English default is invisible in testing (the page looks fine)
    // but it means the /hi homepage — the single most-linked Hindi URL on the
    // site — hands Google an English title and description, which is exactly
    // the signal that makes it rank the English page instead.
    // Used verbatim, not suffixed with the site name, since it already carries it.
    'seo.default.title': 'RojgarHub — Sarkari Jobs, Results & Admit Cards',
    'seo.default.desc': 'RojgarHub: latest government and private job notifications, admit cards, results and answer keys for India. Updated daily.',
    'seo.latest.title': 'Latest Government Jobs',
    'seo.latest.desc': 'Government and private jobs open for application right now. Apply before the last date.',
    'seo.upcoming.title': 'Upcoming Government Jobs',
    'seo.upcoming.desc': 'Job notifications out but applications not yet open. Get your documents ready.',
    'seo.all.title': 'All Government Jobs',
    'seo.all.desc': 'Browse every government job notification — open, upcoming and closed. Filter by category and state.',
    'seo.search.title': 'Search: {q}',
    'seo.admitCard.title': 'Admit Card',
    'seo.admitCard.desc': 'Download latest admit cards and hall tickets for government exams.',
    'seo.result.title': 'Results & Answer Keys',
    'seo.result.desc': 'Latest declared results and released answer keys for government exams.',
    'seo.answerKey.title': 'Answer Keys',
    'seo.answerKey.desc': 'Download official and provisional answer keys for government exams.',
    'seo.syllabus.title': 'Syllabus',
    'seo.syllabus.desc': 'Download latest exam syllabi for SSC, UPSC, Railway, Banking, Police and other government exams.',
    'seo.admission.title': 'Admission Forms',
    'seo.admission.desc': 'Latest university and entrance exam admission forms — apply online before the last date.',
    // These three carry the year in the title because that is how the query is
    // typed — "ssc cgl cut off 2025", not "ssc cgl cut off". The year is filled
    // in at render time from the filter, so the title tracks what is on screen.
    'seo.cutOff.title': 'Cut Off Marks',
    'seo.cutOff.desc': 'Category-wise cut off marks for SSC, UPSC, Railway, Banking, Police and state government exams. Year by year.',
    'seo.examCalendar.title': 'Exam Calendar',
    'seo.examCalendar.desc': 'Upcoming government exam dates, notification dates and application deadlines — one calendar for every recruiting board.',
    'seo.papers.title': 'Previous Year Question Papers',
    'seo.papers.desc': 'Download previous year question papers with answer keys for SSC, UPSC, Railway, Banking and state exams. Free PDFs.',

    'page.openCount': '{n} open',
    'page.onTheWay': '{n} on the way',
    'page.matching': '{n} matching results',
    'page.matchingOne': '1 matching result',
    'page.filterByState': 'Filter by state',
    'page.allStates': 'All states (incl. Central)',
    'page.admitCard.sub': 'Hall tickets released by the recruiting bodies. Newest first.',
    'page.result.sub': 'Declared results and released answer keys. Newest first.',
    'page.result.answerSub': 'Recently released answer keys.',
    'page.answerKey.sub': 'Official and provisional answer keys. Newest first.',
    'page.syllabus.sub': 'Official exam syllabi and patterns.',
    'page.admission.sub': 'University and entrance exam forms. Apply before the last date.',
    'page.updatedOn': 'Updated {date}',
    'page.cutOff.sub': 'Category-wise closing marks, exam by exam and year by year.',
    'page.examCalendar.sub': 'Exam dates, notification dates and last dates to apply.',
    'page.papers.sub': 'Question papers and answer keys, free to download.',
    'page.filterByYear': 'Filter by year',
    'page.allYears': 'All years',
    'page.upcomingOnly': 'Upcoming only',
    'page.includePast': 'Include past exams',

    'cutOff.marks': 'Cut off marks',
    'cutOff.noMarks': 'Marks not published yet — see the official PDF.',
    'cutOff.year': 'Cut off {year}',

    'calendar.notification': 'Notification',
    'calendar.applyBy': 'Apply by',
    'calendar.examDate': 'Exam date',
    // A tentative date shown as though it were final is the most damaging thing
    // a site like this can print, so the label is not optional decoration.
    'calendar.tentative': 'Tentative',
    'calendar.tba': 'To be announced',
    'calendar.held': 'Held',
    'calendar.today': 'Today',

    'paper.answerKey': 'Answer key',
    'paper.withSolution': 'With solution',
    'paper.stage': 'Stage',
    'paper.language': 'Language',

    // The empty state is per page, not one shared "nothing here". A visitor who
    // opens Latest and finds it empty needs to be told where the notifications
    // that do exist are; a visitor who opens Result needs to know results are
    // simply not out yet. The same sentence in both places answers neither.
    'empty.latest': 'Nothing is open for application today. Check the Upcoming page for notifications on the way.',
    // The homepage boxes are three to a row, so they get the short form. The
    // long version above reads as a helpful nudge on a full page and as a wall
    // of text in a 300px box.
    'empty.box.latest': 'No applications are open right now.',
    'empty.box.admitCard': 'No admit cards released yet.',
    'empty.upcoming': 'No upcoming notifications right now.',
    'empty.all': 'No jobs match these filters yet.',
    'empty.search': 'Nothing matched “{q}”. Try a shorter term, like the department name.',
    'empty.admitCard': 'No admit cards released yet. They appear here as soon as each board publishes them.',
    'empty.result': 'No results declared yet.',
    'empty.answerKey': 'No answer keys released yet.',
    'empty.syllabus': 'No syllabi posted yet.',
    'empty.admission': 'No admission forms posted yet.',
    'empty.cutOff': 'No cut off marks posted for this filter yet. They are added as soon as each board publishes them.',
    'empty.examCalendar': 'No exams on the calendar for this filter. Try including past exams, or pick another year.',
    'empty.papers': 'No question papers posted for this filter yet.',

    'share.copied': 'Link copied!',
    'share.copy': 'Copy link',

    'subscribe.title': 'Get job alerts by email',
    'subscribe.sub': 'New vacancies, admit cards and results — straight to your inbox.',
    'subscribe.placeholder': 'Your email address',
    'subscribe.button': 'Subscribe',
    'subscribe.done': 'Subscribed! You will get new job alerts by email.',
    'subscribe.error': "Couldn't subscribe right now — please try again.",

    // Shown when the backend is unreachable. Same wording on every listing
    // page so a returning visitor recognises it instead of reading it again.
    'error.listings': "Listings aren't loading right now. Please refresh in a moment.",
    'error.listingsShort': "The listing service isn't responding. Try again in a moment.",
    'error.pageTitle': "This page didn't load",
    'error.pageBody': "The listing service isn't responding. Try again in a moment, or browse",
    'error.browseLatest': 'the latest jobs',

    'landing.count': '{n} notifications listed',
    'landing.countOne': '1 notification listed',
    'landing.countZero': 'Notifications appear here as they are released',
    'landing.empty': 'Nothing is listed under {name} right now. New notifications are added the day they are released.',
    'landing.browseDepartment': 'Browse by department',
    'landing.browseState': 'Browse by state',
    'landing.alsoOn': 'Also on {site}',
    'landing.centralPrompt': 'Looking for central government vacancies as well?',
    'landing.centralLink': 'Browse central government jobs',
    'landing.filterAll': 'Filter all {name}',
    'landing.descSuffix': 'Updated daily with last dates, eligibility and official links.',

    'lang.toHindi': 'हिंदी में देखें',
    'lang.toEnglish': 'View in English',
    'nav.toggleMenu': 'Toggle menu',

    'notfound.title': 'Page not found',
    'notfound.body': 'The page you asked for has moved or never existed. These are the pages people come here for:',
    'notfound.tryThese': 'Try one of these',
    'notfound.metaLatest': 'Everything open for application right now',
    'notfound.metaResult': 'Recently declared results',
    'notfound.metaAdmit': 'Released hall tickets',
    'notfound.metaAll': 'Search and filter every posting',

    'footer.disclaimer': 'not affiliated with any Govt body',
  },

  hi: {
    'nav.home': 'होम',
    'nav.latest': 'नई भर्तियाँ',
    'nav.upcoming': 'आने वाली',
    'nav.all': 'सभी भर्तियाँ',
    'nav.admitCard': 'एडमिट कार्ड',
    'nav.result': 'रिज़ल्ट',
    'nav.answerKey': 'आंसर की',
    'nav.syllabus': 'सिलेबस',
    'nav.admission': 'एडमिशन',
    // "कट ऑफ" and "पेपर" transliterated rather than translated: these are the
    // words aspirants use and search for. A correct Hindi coining nobody types
    // would cost the page its traffic.
    'nav.cutOff': 'कट ऑफ',
    'nav.examCalendar': 'परीक्षा कैलेंडर',
    'nav.papers': 'पुराने पेपर',

    'home.latest': 'नई भर्तियाँ',
    'home.upcoming': 'आने वाली भर्तियाँ',
    'home.admitCard': 'एडमिट कार्ड',
    'home.result': 'रिज़ल्ट',
    'home.viewAll': 'सभी देखें',
    'home.searchPlaceholder': 'पद या संस्था खोजें…',
    'home.search': 'खोजें',
    'home.browseByCategory': 'श्रेणी से देखें',

    'ticker.label': 'जल्द बंद',
    'action.view': 'देखें',
    'action.download': 'डाउनलोड',

    'row.start': 'शुरू',
    'row.last': 'अंतिम',
    'row.opens': 'खुलेगा',
    'row.lastDayToday': 'आज अंतिम दिन!',
    'row.daysLeft': '{n} दिन बाकी',
    'row.dayLeft': '1 दिन बाकी',
    'row.inDays': '{n} दिन में',
    'row.inDay': '1 दिन में',
    'row.new': 'नया',
    'row.posts': 'पद',
    'row.viewJob': 'भर्ती देखें',
    'row.released': 'जारी',

    'status.open': 'खुला',
    'status.upcoming': 'आने वाली',
    'status.closed': 'बंद',

    'job.applicationsOpen': 'आवेदन चालू हैं',
    'job.applicationsSoon': 'आवेदन जल्द शुरू होंगे',
    'job.applicationsClosed': 'आवेदन बंद हो चुके हैं',
    'job.apply': 'आधिकारिक साइट पर आवेदन करें',
    'job.notificationPdf': 'नोटिफ़िकेशन PDF',
    'job.syllabus': 'सिलेबस',
    'job.importantDates': 'महत्वपूर्ण तिथियाँ',
    'job.importantLinks': 'महत्वपूर्ण लिंक',
    'job.latestUpdates': 'ताज़ा अपडेट',
    'job.applicationFee': 'आवेदन शुल्क',
    'job.ageRelaxation': 'आयु में छूट',
    'job.eligibility': 'योग्यता',
    'job.selectionProcess': 'चयन प्रक्रिया',
    'job.totalPosts': 'कुल पद',
    'job.lastDate': 'अंतिम तिथि',
    'job.ageLimit': 'आयु सीमा',
    'job.views': 'बार देखा गया',
    'job.share': 'यह भर्ती शेयर करें',
    'job.advtNo': 'विज्ञापन सं.',
    'job.source': 'स्रोत',
    'job.lastUpdated': 'अंतिम अपडेट',
    'job.years': 'वर्ष',
    'job.noFee': 'कोई शुल्क नहीं',
    'job.plusYears': '+{n} वर्ष',

    'job.examSchedule': 'परीक्षा कार्यक्रम',
    'job.syllabusFor': 'सिलेबस और परीक्षा पैटर्न',
    'job.pastPapers': 'पिछले वर्षों के प्रश्न पत्र',
    'job.pastCutOffs': 'कट ऑफ अंक (पिछले वर्ष)',
    'job.pastCutOffsNote': 'इस परीक्षा के पिछले चक्रों की — इस साल की कट ऑफ नहीं।',

    'job.dateStart': 'आवेदन शुरू',
    'job.dateLast': 'आवेदन की अंतिम तिथि',
    'job.dateAdmit': 'एडमिट कार्ड (संभावित)',
    'job.dateExam': 'परीक्षा तिथि',
    'job.dateResult': 'रिज़ल्ट (संभावित)',

    'job.applyOnline': 'ऑनलाइन आवेदन करें',
    'job.officialNotification': 'आधिकारिक नोटिफ़िकेशन',
    'job.clickHere': 'यहाँ क्लिक करें',
    'job.downloadPdf': 'PDF डाउनलोड करें',
    'job.viewSyllabus': 'सिलेबस देखें',
    'job.moreCategory': '{name} की और भर्तियाँ',
    'job.allStateVacancies': '{state} की सभी भर्तियाँ',
    'job.browseAll': 'सभी देखें',
    'job.downloadAdmitCard': 'एडमिट कार्ड डाउनलोड करें',
    'job.viewResult': 'रिज़ल्ट देखें',
    'job.viewAnswerKey': 'आंसर की देखें',

    'page.latest.sub': 'आवेदन अभी चालू हैं — अंतिम तिथि से पहले आवेदन करें।',
    'page.upcoming.sub': 'नोटिफ़िकेशन आ चुका है, आवेदन अभी शुरू नहीं हुए।',
    'page.all.sub': 'साइट की हर भर्ती — खुली, आने वाली और बंद — नीचे श्रेणी से छाँटें।',
    'page.all.title': 'सभी भर्तियाँ',
    'page.searchResults': '"{q}" के लिए खोज परिणाम',
    'page.prev': 'पिछला',
    'page.next': 'अगला',
    'chip.all': 'सभी',

    // Not a translation of the English title — a Hindi title that reads like
    // something a person would type. "नई सरकारी भर्तियाँ" is the search, "Latest
    // Government Jobs" transliterated is not.
    // "सरकारी नौकरी" is the term people actually type; it stays in the title
    // even though the brand name is Latin, because the brand is not what wins
    // the search.
    'seo.default.title': 'RojgarHub — सरकारी नौकरी, रिज़ल्ट और एडमिट कार्ड',
    'seo.default.desc': 'RojgarHub: भारत की ताज़ा सरकारी और प्राइवेट भर्तियाँ, एडमिट कार्ड, रिज़ल्ट और आंसर की। रोज़ अपडेट।',
    'seo.latest.title': 'नई सरकारी भर्तियाँ',
    'seo.latest.desc': 'जिन सरकारी और प्राइवेट भर्तियों के आवेदन अभी खुले हैं — अंतिम तिथि से पहले आवेदन करें।',
    'seo.upcoming.title': 'आने वाली सरकारी भर्तियाँ',
    'seo.upcoming.desc': 'नोटिफ़िकेशन आ चुका है, आवेदन अभी शुरू नहीं हुए — दस्तावेज़ तैयार रखें।',
    'seo.all.title': 'सभी सरकारी भर्तियाँ',
    'seo.all.desc': 'हर सरकारी भर्ती एक जगह — खुली, आने वाली और बंद। श्रेणी और राज्य से छाँटें।',
    'seo.search.title': 'खोज: {q}',
    'seo.admitCard.title': 'एडमिट कार्ड',
    'seo.admitCard.desc': 'सरकारी परीक्षाओं के ताज़ा एडमिट कार्ड और हॉल टिकट डाउनलोड करें।',
    'seo.result.title': 'रिज़ल्ट और आंसर की',
    'seo.result.desc': 'सरकारी परीक्षाओं के ताज़ा घोषित रिज़ल्ट और जारी आंसर की।',
    'seo.answerKey.title': 'आंसर की',
    'seo.answerKey.desc': 'सरकारी परीक्षाओं की आधिकारिक और प्रोविज़नल आंसर की डाउनलोड करें।',
    'seo.syllabus.title': 'सिलेबस',
    'seo.syllabus.desc': 'SSC, UPSC, रेलवे, बैंकिंग, पुलिस और अन्य सरकारी परीक्षाओं का ताज़ा सिलेबस डाउनलोड करें।',
    'seo.admission.title': 'एडमिशन फॉर्म',
    'seo.admission.desc': 'विश्वविद्यालय और प्रवेश परीक्षाओं के ताज़ा एडमिशन फॉर्म — अंतिम तिथि से पहले ऑनलाइन आवेदन करें।',

    // "कट ऑफ" and "पेपर" transliterated in the titles too, not just the nav. The
    // title tag is the string Google matches against the query, and the query is
    // "ssc cgl cut off" written in Devanagari — a correct coining like
    // "अर्हता अंक" would describe the page to nobody who is looking for it.
    'seo.cutOff.title': 'कट ऑफ मार्क्स',
    'seo.cutOff.desc': 'SSC, UPSC, रेलवे, बैंकिंग, पुलिस और राज्य सरकार की परीक्षाओं की श्रेणी-वार कट ऑफ — साल दर साल।',
    'seo.examCalendar.title': 'परीक्षा कैलेंडर',
    'seo.examCalendar.desc': 'आने वाली सरकारी परीक्षाओं की तिथियाँ, नोटिफ़िकेशन और आवेदन की अंतिम तारीखें — हर भर्ती बोर्ड का एक ही कैलेंडर।',
    'seo.papers.title': 'पिछले साल के प्रश्न पत्र',
    'seo.papers.desc': 'SSC, UPSC, रेलवे, बैंकिंग और राज्य परीक्षाओं के पिछले साल के प्रश्न पत्र आंसर की के साथ डाउनलोड करें। मुफ़्त PDF।',

    // "{n} खुली" and "{n} आने वाली" are noun-free on purpose: the heading right
    // above already says भर्तियाँ, and repeating it reads like a stutter.
    'page.openCount': '{n} खुली',
    'page.onTheWay': '{n} आने वाली',
    'page.matching': '{n} परिणाम मिले',
    'page.matchingOne': '1 परिणाम मिला',
    'page.filterByState': 'राज्य से छाँटें',
    'page.allStates': 'सभी राज्य (केंद्र सहित)',
    'page.admitCard.sub': 'भर्ती संस्थाओं द्वारा जारी हॉल टिकट। नए पहले।',
    'page.result.sub': 'घोषित रिज़ल्ट और जारी आंसर की। नए पहले।',
    'page.result.answerSub': 'हाल में जारी आंसर की।',
    'page.answerKey.sub': 'आधिकारिक और प्रोविज़नल आंसर की। नई पहले।',
    'page.syllabus.sub': 'आधिकारिक परीक्षा सिलेबस और पैटर्न।',
    'page.admission.sub': 'विश्वविद्यालय और प्रवेश परीक्षा के फॉर्म। अंतिम तिथि से पहले आवेदन करें।',
    'page.updatedOn': '{date} को अपडेट',
    'page.cutOff.sub': 'श्रेणी-वार कट ऑफ अंक, परीक्षा और साल के हिसाब से।',
    'page.examCalendar.sub': 'परीक्षा तिथि, नोटिफिकेशन तिथि और आवेदन की अंतिम तिथि।',
    'page.papers.sub': 'प्रश्न पत्र और आंसर की, मुफ़्त डाउनलोड।',
    'page.filterByYear': 'साल से छाँटें',
    'page.allYears': 'सभी साल',
    'page.upcomingOnly': 'सिर्फ़ आने वाली',
    'page.includePast': 'बीती परीक्षाएँ भी दिखाएँ',

    'cutOff.marks': 'कट ऑफ अंक',
    'cutOff.noMarks': 'अंक अभी प्रकाशित नहीं — आधिकारिक PDF देखें।',
    'cutOff.year': '{year} कट ऑफ',

    'calendar.notification': 'नोटिफिकेशन',
    'calendar.applyBy': 'आवेदन अंतिम तिथि',
    'calendar.examDate': 'परीक्षा तिथि',
    'calendar.tentative': 'संभावित',
    'calendar.tba': 'घोषित होना बाकी',
    'calendar.held': 'हो चुकी',
    'calendar.today': 'आज',

    'paper.answerKey': 'आंसर की',
    'paper.withSolution': 'हल सहित',
    'paper.stage': 'चरण',
    'paper.language': 'भाषा',

    'empty.latest': 'आज किसी भर्ती के आवेदन खुले नहीं हैं। जो भर्तियाँ आने वाली हैं वे "आने वाली" पेज पर देखें।',
    'empty.box.latest': 'अभी किसी भर्ती के आवेदन खुले नहीं हैं।',
    'empty.box.admitCard': 'अभी कोई एडमिट कार्ड जारी नहीं हुआ।',
    'empty.upcoming': 'अभी कोई आने वाली भर्ती सूचीबद्ध नहीं है।',
    'empty.all': 'इन फ़िल्टरों से कोई भर्ती नहीं मिली।',
    'empty.search': '“{q}” से कुछ नहीं मिला। छोटा शब्द आज़माएँ, जैसे सिर्फ़ विभाग का नाम।',
    'empty.admitCard': 'अभी कोई एडमिट कार्ड जारी नहीं हुआ। हर बोर्ड के जारी करते ही वे यहाँ दिखेंगे।',
    'empty.result': 'अभी कोई रिज़ल्ट घोषित नहीं हुआ।',
    'empty.answerKey': 'अभी कोई आंसर की जारी नहीं हुई।',
    'empty.syllabus': 'अभी कोई सिलेबस नहीं जोड़ा गया।',
    'empty.admission': 'अभी कोई एडमिशन फॉर्म नहीं जोड़ा गया।',
    'empty.cutOff': 'इस फ़िल्टर के लिए अभी कोई कट ऑफ नहीं जोड़ी गई। बोर्ड के जारी करते ही यहाँ जुड़ जाएगी।',
    'empty.examCalendar': 'इस फ़िल्टर में कोई परीक्षा नहीं है। बीती परीक्षाएँ भी दिखाएँ, या दूसरा साल चुनें।',
    'empty.papers': 'इस फ़िल्टर के लिए अभी कोई प्रश्न पत्र नहीं जोड़ा गया।',

    'share.copied': 'लिंक कॉपी हो गया!',
    'share.copy': 'लिंक कॉपी करें',

    'subscribe.title': 'ईमेल पर जॉब अलर्ट पाएँ',
    'subscribe.sub': 'नई भर्तियाँ, एडमिट कार्ड और रिज़ल्ट — सीधे आपके इनबॉक्स में।',
    'subscribe.placeholder': 'आपका ईमेल पता',
    'subscribe.button': 'सब्सक्राइब करें',
    'subscribe.done': 'सब्सक्राइब हो गया! नई भर्तियों की जानकारी ईमेल पर मिलेगी।',
    'subscribe.error': 'अभी सब्सक्राइब नहीं हो सका — कृपया फिर कोशिश करें।',

    'error.listings': 'सूची अभी लोड नहीं हो रही है। कृपया थोड़ी देर में रिफ्रेश करें।',
    'error.listingsShort': 'सूची सेवा जवाब नहीं दे रही है। कृपया थोड़ी देर में फिर कोशिश करें।',
    'error.pageTitle': 'यह पेज लोड नहीं हो सका',
    'error.pageBody': 'सूची सेवा जवाब नहीं दे रही है। थोड़ी देर में फिर कोशिश करें, या देखें',
    'error.browseLatest': 'नई भर्तियाँ',

    'landing.count': '{n} भर्तियाँ सूचीबद्ध',
    'landing.countOne': '1 भर्ती सूचीबद्ध',
    'landing.countZero': 'नई भर्तियाँ जारी होते ही यहाँ दिखेंगी',
    'landing.empty': 'फ़िलहाल {name} के अंतर्गत कुछ सूचीबद्ध नहीं है। नई भर्तियाँ जारी होने के दिन ही जोड़ दी जाती हैं।',
    'landing.browseDepartment': 'विभाग से देखें',
    'landing.browseState': 'राज्य से देखें',
    'landing.alsoOn': '{site} पर और भी',
    'landing.centralPrompt': 'केंद्र सरकार की भर्तियाँ भी देखनी हैं?',
    'landing.centralLink': 'केंद्र सरकार की भर्तियाँ देखें',
    'landing.filterAll': 'सभी {name} छाँटें',
    'landing.descSuffix': 'अंतिम तिथि, योग्यता और आधिकारिक लिंक के साथ रोज़ अपडेट।',

    'lang.toHindi': 'हिंदी में देखें',
    'lang.toEnglish': 'View in English',
    'nav.toggleMenu': 'मेनू खोलें या बंद करें',

    'notfound.title': 'पेज नहीं मिला',
    'notfound.body': 'आपने जो पेज खोला है वह हट चुका है या कभी था ही नहीं। लोग यहाँ इन पेजों के लिए आते हैं:',
    'notfound.tryThese': 'इनमें से कोई देखें',
    'notfound.metaLatest': 'जिनके आवेदन अभी खुले हैं',
    'notfound.metaResult': 'हाल में घोषित रिज़ल्ट',
    'notfound.metaAdmit': 'जारी हो चुके एडमिट कार्ड',
    'notfound.metaAll': 'हर भर्ती खोजें और छाँटें',

    'footer.disclaimer': 'किसी सरकारी संस्था से संबद्ध नहीं',
  },
};

const LangContext = createContext({ lang: 'en', otherLang: 'hi', t: k => k });

export function LangProvider({ children }) {
  // useRouter returns null outside a Next app (tests, storybook), and locale is
  // undefined when i18n is not configured — both fall back to English rather
  // than throwing, because a missing locale must never take a page down.
  const router = useRouter();
  const raw = router?.locale;
  const lang = LOCALES.includes(raw) ? raw : DEFAULT_LOCALE;

  // t('row.daysLeft', { n: 5 }) -> "5 days left" / "5 दिन बाकी"
  //
  // Falls through to English for a key that exists in one dictionary and not the
  // other, so a half-finished translation shows English words rather than a raw
  // "row.daysLeft" to a real visitor.
  function t(key, vars) {
    let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  const value = {
    lang,
    otherLang: lang === 'hi' ? 'en' : 'hi',
    t,
    /** For number and date formatting: 'hi-IN' still uses Latin digits. */
    htmlLang: lang === 'hi' ? 'hi-IN' : 'en-IN',
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
