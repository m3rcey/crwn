// JWT-based survey tokens for unauthenticated survey access
// Tokens encode respondent info so surveys can be submitted without login

import { createHmac } from 'crypto';

const SECRET = process.env.SURVEY_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'survey-secret-fallback';

interface SurveyTokenPayload {
  respondentId: string;
  artistId: string | null; // null for platform surveys
  surveyType: 'loyalty_fan' | 'loyalty_artist';
  exp: number; // expiry timestamp (ms)
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function fromBase64url(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createSurveyToken(payload: Omit<SurveyTokenPayload, 'exp'>, expiresInDays = 30): string {
  const data: SurveyTokenPayload = {
    ...payload,
    exp: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  };
  const encoded = base64url(JSON.stringify(data));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySurveyToken(token: string): SurveyTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expectedSig = sign(encoded);

  if (signature !== expectedSig) return null;

  try {
    const payload: SurveyTokenPayload = JSON.parse(fromBase64url(encoded));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
