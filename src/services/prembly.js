import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://api.prembly.com/identitypass/verification';
const HEADERS = {
  'x-api-key':      process.env.PREMBLY_API_KEY,
  'app-id':         process.env.PREMBLY_APP_ID,
  'Content-Type':   'application/json',
};

// ── Dev bypass ────────────────────────────────────────────
// Set PREMBLY_DEV_BYPASS=true in .env to skip real API calls
// during development. Remove (or set to false) before going live.
const DEV_BYPASS = process.env.PREMBLY_DEV_BYPASS === 'true';

// ── NIN Verification ─────────────────────────────────────
export const verifyNIN = async (nin, full_name) => {
  if (DEV_BYPASS) {
    console.log(`[DEV] NIN bypass — nin: ${nin}, name: ${full_name}`);
    return { verified: true, data: { firstname: full_name.split(' ')[0], lastname: full_name.split(' ')[1] || '' } };
  }

  try {
    const res = await fetch(`${BASE_URL}/nigeria/nin`, {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify({ number: nin }),
    });
    const data = await res.json();

    if (!data.status || !data.nin_data) {
      return { verified: false, reason: 'NIN not found in NIMC records' };
    }

    // Cross-check name
    const returned = `${data.nin_data.firstname || ''} ${data.nin_data.lastname || ''}`.toLowerCase().trim();
    const input    = full_name.toLowerCase().trim();
    const inputParts = input.split(' ');
    const nameMatch = inputParts.some(part => part.length > 1 && returned.includes(part));

    if (!nameMatch) {
      return { verified: false, reason: 'Name on NIN does not match your registered name' };
    }

    return { verified: true, data: data.nin_data };
  } catch (err) {
    console.error('NIN verification error:', err);
    return { verified: false, reason: 'Verification service unavailable. Please try again.' };
  }
};

// ── CAC Verification ─────────────────────────────────────
export const verifyCAC = async (rc_number, company_name) => {
  if (DEV_BYPASS) {
    console.log(`[DEV] CAC bypass — rc_number: ${rc_number}, company: ${company_name}`);
    return { verified: true, data: { company_name } };
  }

  try {
    const res = await fetch(`${BASE_URL}/nigeria/cac`, {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify({ rc_number }),
    });
    const data = await res.json();

    if (!data.status || !data.data) {
      return { verified: false, reason: 'Company not found in CAC records' };
    }

    // Cross-check company name
    const returned = (data.data.company_name || '').toLowerCase().trim();
    const input    = company_name.toLowerCase().trim();
    const inputFirstWord = input.split(' ')[0];
    const nameMatch = returned.includes(inputFirstWord) || input.includes(returned.split(' ')[0]);

    if (!nameMatch) {
      return { verified: false, reason: 'Company name does not match CAC records' };
    }

    return { verified: true, data: data.data };
  } catch (err) {
    console.error('CAC verification error:', err);
    return { verified: false, reason: 'Verification service unavailable. Please try again.' };
  }
};
