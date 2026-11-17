/** Shared person-name helpers for profiles, user forms, and printouts. */

const TITLE_PREFIXES = new Set([
  'mr.',
  'ms.',
  'mrs.',
  'miss.',
  'dr.',
  'atty.',
  'engr.',
  'prof.',
]);

/** Surname particles kept with the family name (Filipino / Spanish / Portuguese / Dutch / etc.). */
const SURNAME_PARTICLES = new Set([
  'af',
  'al',
  'bin',
  'binti',
  'da',
  'das',
  'de',
  'del',
  'dela',
  'della',
  'der',
  'di',
  'do',
  'dos',
  'du',
  'el',
  'ibn',
  'la',
  'las',
  'le',
  'les',
  'los',
  'op',
  'san',
  'santa',
  'santo',
  'st',
  'st.',
  'ste',
  'ten',
  'ter',
  'van',
  'von',
  'y',
  'zu',
  'zur',
]);

export type ParsedPersonName = {
  prefix: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
};

/** Strip trailing dots, then ensure a single trailing period for abbreviations. */
export function normalizeAbbreviation(value: string): string {
  const abbreviation = value.trim().replace(/\.+$/, '');
  return abbreviation ? `${abbreviation}.` : '';
}

/** Middle initial as "M." from a middle name or initial. */
export function middleInitial(middleName?: string | null): string {
  const raw = String(middleName ?? '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/\.+$/, '');
  const letter = cleaned.charAt(0);
  if (!letter || !/\p{L}/u.test(letter)) return '';

  return `${letter.toUpperCase()}.`;
}

/** Compose the stored display name: "Quia M. De Felipe". */
export function formatDisplayName(
  firstName: string,
  middleName?: string | null,
  lastName?: string | null,
  prefix?: string | null,
): string {
  const title = prefix ? normalizeAbbreviation(prefix) : '';
  const initial = middleInitial(middleName);
  const parts = [
    title,
    firstName.trim(),
    initial,
    String(lastName ?? '').trim(),
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function isSurnameParticle(token: string): boolean {
  return SURNAME_PARTICLES.has(token.trim().toLowerCase());
}

function isMiddleInitialToken(token: string): boolean {
  return /^[\p{L}]\.*$/u.test(token.trim());
}

/**
 * Split a stored display name into form fields.
 * Multi-word surnames with particles (De / Del / De la / Van / …) stay in last_name;
 * only a real middle initial (or middle name) becomes middle_initial.
 */
export function parseFullName(fullName: string): ParsedPersonName {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  let prefix = '';
  let first_name = '';
  let middle_initial = '';
  let last_name = '';

  if (parts.length === 0) {
    return { prefix, first_name, middle_initial, last_name };
  }

  const firstToken = parts[0];
  const normalizedFirst = normalizeAbbreviation(firstToken).toLowerCase();
  if (TITLE_PREFIXES.has(normalizedFirst) || firstToken.endsWith('.')) {
    // Avoid treating a bare middle initial like "M." as a title when it is the only dotted token
    // after the first name — titles are only accepted at the start.
    if (TITLE_PREFIXES.has(normalizedFirst) || firstToken.length > 2) {
      prefix = normalizeAbbreviation(parts.shift() || '');
    }
  }

  if (parts.length === 0) {
    return { prefix, first_name, middle_initial, last_name };
  }

  const lastTokens: string[] = [parts.pop() || ''];
  while (parts.length > 0 && isSurnameParticle(parts[parts.length - 1])) {
    lastTokens.unshift(parts.pop() || '');
  }
  last_name = lastTokens.join(' ');

  if (parts.length > 0) {
    const miCandidate = parts[parts.length - 1];
    if (isMiddleInitialToken(miCandidate)) {
      middle_initial = normalizeAbbreviation(parts.pop() || '');
    } else if (parts.length > 1) {
      const middleName = parts.pop() || '';
      middle_initial = middleInitial(middleName);
    }
  }

  first_name = parts.join(' ');
  return { prefix, first_name, middle_initial, last_name };
}
