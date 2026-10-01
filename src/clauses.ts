// Spec 038 (was 034). A copy of weassist-callbot server.mjs clauses()/segment() (callbot spec 006):
// the two repos have different owners, so the text is copied, not shared. Change both (rule 67).
export function clauses(text: unknown): string[] {
  const t = String(text);
  const abbr = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|no|approx|dept|inc|ltd|[a-z]|(?:[a-z]\.)+[a-z])\.$/i;
  const pieces: string[] = [];
  let start = 0;
  const cut = (i: number) => { const p = t.slice(start, i).trim(); if (p) pieces.push(p); start = i; };
  for (const m of t.matchAll(/\s+/g)) {
    const i = m.index!, prev = t[i - 1] || '', next = t.slice(i + m[0].length, i + m[0].length + 2);
    const after = /[.,;:!?…)\]}"”»|\/—–-]/.test(prev) && !(prev === '.' && abbr.test(t.slice(start, i)));
    const before = /^[([{"“«•|\/—–]/.test(next) || /^(?:[-*] |--)/.test(next);
    if (m[0].includes('\n') || after || before) cut(i);
  }
  cut(t.length);
  // Inside a word: after an em dash, en dash or pipe, and at a slash between two plain words.
  const inner = /(?<=[—–|])(?=[\p{L}\p{N}])|(?<=(?:^|\s)\p{L}+\/)(?=\p{L}+[.,;:!?]?(?:\s|$))/u;
  const out: string[] = [];
  let carry = '';
  for (const p of pieces.flatMap((p) => p.split(inner))) {
    // A piece with no letter or digit (a lone dash, a bullet) goes with the next piece.
    if (!/[\p{L}\p{N}]/u.test(p)) { carry += p + ' '; continue; }
    out.push(carry + p);
    carry = '';
  }
  if (carry.trim()) out.length ? (out[out.length - 1] += ' ' + carry.trim()) : out.push(carry.trim());
  return out;
}
export function segment(text: unknown): string[] {
  // A piece with no punctuation (a list, a table) would be one huge clip that
  // takes seconds to render; cut it at a word near 300 characters.
  return clauses(text).flatMap((p) => p.match(/[\s\S]{1,300}(\s|$)|\S+/g) || []).map((t) => t.trim()).filter(Boolean);
}
