// parser.js
// Turns a pasted "Key : Value" text block into a structured candidate record.
// Designed to tolerate messy real-world input: extra spaces, typos like
// "Email  I'd" instead of "Email Id", "Reffered by" instead of "Referred by", etc.

const FIELD_ALIASES = {
  name: ['name'],
  skills: ['skills', 'skill'],
  mobile: ['mobileno', 'mobile', 'phoneno', 'phone', 'contactno'],
  email: ['emailid', 'email', 'emailld', 'mailid'], // "emailld" catches the "Email I'd" typo
  current_location: ['currentlocation'],
  preferred_location: ['preferredlocation'],
  current_company: ['currentcompany'],
  total_exp: ['totalexp', 'totalexperience'],
  rel_exp: ['relexp', 'relevantexp', 'relevantexperience'],
  notice_period: ['noticeperiod', 'notice'],
  current_ctc: ['currentctc'],
  exp_ctc: ['expctc', 'expectedctc'],
  referred_by: ['refferedby', 'referredby', 'referedby', 'reffered', 'referred'],
  reference_Phoneno: ['referencephonenumber', 'referencephone', 'referencephoneno', 'referencecontactno']
};

// Strip everything except letters so "Mobile no", "Mobile-No", "mobile_no"
// all normalize to the same key: "mobileno".
function normalizeKey(rawKey) {
  return rawKey.toLowerCase().replace(/[^a-z]/g, '');
}

function matchField(normalizedKey) {
  // 1. Exact alias match first (most reliable).
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalizedKey)) return field;
  }

  // 2. Fuzzy fallback, most-specific checks first so e.g. "expctc" doesn't
  //    get caught by a generic "exp" rule before the ctc-specific one runs.
  if (normalizedKey.includes('ctc')) {
    return normalizedKey.includes('current') ? 'current_ctc' : 'exp_ctc';
  }
  if (normalizedKey.includes('location')) {
    return normalizedKey.includes('current') ? 'current_location' : 'preferred_location';
  }
  if (normalizedKey.includes('company')) return 'current_company';
  if (normalizedKey.includes('rel') && normalizedKey.includes('exp')) return 'rel_exp';
  if (normalizedKey.includes('total') && normalizedKey.includes('exp')) return 'total_exp';
  if (normalizedKey.includes('notice')) return 'notice_period';
  if (normalizedKey.includes('mobile') || normalizedKey.includes('phone')) return 'mobile';
  if (normalizedKey.includes('email') || normalizedKey.includes('mail')) return 'email';
  if (normalizedKey.includes('refer')) return 'referred_by';
  if (normalizedKey.includes('skill')) return 'skills';
  if (normalizedKey.includes('name') && !normalizedKey.includes('company')) return 'name';

  return null; // unrecognized line, ignored
}

function parseCandidateText(rawText) {
  const result = {
    name: '', skills: '', mobile: '', email: '',
    current_location: '', preferred_location: '', current_company: '',
    total_exp: '', rel_exp: '', notice_period: '',
    current_ctc: '', exp_ctc: '', referred_by: '', reference_Phoneno: ''
  };

  const lines = String(rawText).split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;

    const field = matchField(normalizeKey(rawKey));
    if (field) result[field] = value;
  }

  return result;
}

module.exports = { parseCandidateText };
