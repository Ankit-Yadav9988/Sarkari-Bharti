/** Official sources plus one discovery index; discovery rows still require verification. */
export const SOURCES = [
  {
    id: 'sarkariresult', kind: 'aggregator',
    name: 'Sarkari Result discovery', organization: null, category: 'CENTRAL_GOVT',
    // Discovery only: detail pages are used to find official links and every
    // row remains a manual-review candidate before publication.
    // The apex host is reachable from GitHub-hosted runners where the www
    // alias intermittently returns a generic 403 page.
    url: 'https://sarkariresult.com/latestjob/',
    allowedHosts: ['sarkariresult.com', 'www.sarkariresult.com'],
    maxCandidates: 120,
  },
  {
    id: 'ssc', name: 'Staff Selection Commission', organization: 'Staff Selection Commission', category: 'SSC',
    // The public notice board is rendered client-side. This is its official
    // read-only data feed, so a normal HTTP request sees the same notices that
    // a browser receives instead of an empty application shell.
    url: 'https://ssc.gov.in/api/general-website/portal/notice-boards?page=1&limit=50&contentType=notice-boards&key=createdAt&order=DESC&isAttachment=true&language=english&attributes=id%2Cheadline%2CexamId%2CcontentType%2CredirectUrl%2CstartDate%2CendDate%2Clanguage%2CcreatedAt',
    format: 'json', allowedHosts: ['ssc.gov.in'],
  },
  {
    id: 'rrb', name: 'Railway Recruitment Board', organization: 'Railway Recruitment Board', category: 'RAILWAY',
    url: 'https://rrbcdg.gov.in/employment-notices.php', allowedHosts: ['rrbcdg.gov.in', 'www.rrbcdg.gov.in'],
  },
  {
    id: 'upsc', name: 'Union Public Service Commission', organization: 'Union Public Service Commission', category: 'UPSC',
    url: 'https://upsc.gov.in/recruitment/recruitment-advertisement', allowedHosts: ['upsc.gov.in', 'www.upsc.gov.in'],
  },
  {
    id: 'uppsc', name: 'Uttar Pradesh Public Service Commission', organization: 'Uttar Pradesh Public Service Commission', category: 'STATE_PSC', state: 'Uttar Pradesh',
    url: 'https://uppsc.up.nic.in/', allowedHosts: ['uppsc.up.nic.in'],
  },
  {
    id: 'bpsc', name: 'Bihar Public Service Commission', organization: 'Bihar Public Service Commission', category: 'STATE_PSC', state: 'Bihar',
    url: 'https://bpsc.bihar.gov.in/advertisement/', allowedHosts: ['bpsc.bihar.gov.in'],
  },
  {
    id: 'rpsc', name: 'Rajasthan Public Service Commission', organization: 'Rajasthan Public Service Commission', category: 'STATE_PSC', state: 'Rajasthan',
    url: 'https://rpsc.rajasthan.gov.in/advertisements', allowedHosts: ['rpsc.rajasthan.gov.in'],
  },
  {
    id: 'mppsc', name: 'Madhya Pradesh Public Service Commission', organization: 'Madhya Pradesh Public Service Commission', category: 'STATE_PSC', state: 'Madhya Pradesh',
    url: 'https://mppsc.mp.gov.in/', allowedHosts: ['mppsc.mp.gov.in'],
  },
  {
    id: 'ukpsc', name: 'Uttarakhand Public Service Commission', organization: 'Uttarakhand Public Service Commission', category: 'STATE_PSC', state: 'Uttarakhand',
    url: 'https://psc.uk.gov.in/candidate-corner/recruitment', allowedHosts: ['psc.uk.gov.in'],
  },
];

export const RECRUITMENT_KEYWORDS = [
  'recruitment', 'vacancy', 'vacancies', 'advertisement', 'advt', 'employment notice',
  'apply online', 'online application', 'notification', 'notice', 'centralised employment', 'भर्ती', 'विज्ञापन', 'रोजगार',
];

export const NOTICE_KEYWORDS = ['result', 'admit card', 'answer key', 'results', 'e-call letter', 'परिणाम', 'प्रवेश पत्र', 'उत्तर कुंजी'];
