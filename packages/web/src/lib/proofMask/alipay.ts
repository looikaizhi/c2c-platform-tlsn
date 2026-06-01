/**
 * Alipay masking rules.
 *
 * Alipay's `fundReportDetailQuery.json` response masks the payee identity:
 *   - name : first token (space-separated, e.g. English names) → "*";
 *            no space (e.g. CJK names) → first character → "*".
 *   - email: keep first 3 chars of the local part, then "***", then "@domain".
 *   - phone: keep first 3 and last 3 digits, mask the middle.
 *
 * These outputs are used ONLY as the commit pre-image; the full value is what
 * we store + display. The masked form must match Alipay's real bytes exactly
 * (case/whitespace are normalized away downstream, but star count, star
 * position and inter-word spaces are significant).
 */
import type { Masker, PayeeIdentity } from './types';

/** "KELLY LIM HOOI YEN" → "* LIM HOOI YEN"; "林凯智" → "*凯智". */
export function maskAlipayName(full: string): string {
    const s = full.trim();
    if (s.length === 0) return s;
    const firstSpace = s.indexOf(' ');
    if (firstSpace > 0) {
        // English-style: replace the entire first token with "*".
        return '*' + s.slice(firstSpace);
    }
    // CJK-style (no space): replace just the first character.
    return '*' + s.slice(1);
}

/** "kellylimhooiyen@hotmail.com" → "kel***@hotmail.com". */
export function maskAlipayEmail(full: string): string {
    const s = full.trim();
    const at = s.indexOf('@');
    if (at < 0) return s; // not an email — caller should route to phone
    const local = s.slice(0, at);
    const domain = s.slice(at); // includes "@"
    return local.slice(0, 3) + '***' + domain;
}

/**
 * "15812345662" → "158*****662".
 * ⚠️ UNVERIFIED against a real Alipay phone response — the middle star count is
 * a best-effort guess (one star per masked digit). Pin this down with a real
 * sample before enabling phone-based Alipay accounts.
 */
export function maskAlipayPhone(full: string): string {
    const s = full.trim();
    if (s.length <= 6) return s;
    const middleLen = s.length - 6;
    return s.slice(0, 3) + '*'.repeat(middleLen) + s.slice(-3);
}

/** Email if it contains "@", otherwise treated as a phone number. */
export function maskAlipayHandle(full: string): string {
    return full.includes('@') ? maskAlipayEmail(full) : maskAlipayPhone(full);
}

export const alipayMasker: Masker = (identity: PayeeIdentity): PayeeIdentity => ({
    name: maskAlipayName(identity.name),
    handle: maskAlipayHandle(identity.handle),
});
