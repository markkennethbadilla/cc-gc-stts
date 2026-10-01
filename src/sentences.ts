// Spec 038. One clip per sentence (Intl.Segmenter), so the first sentence plays while the next
// renders. Piper keeps its own natural pauses; nothing is cut at commas or trimmed.
export function segment(text: unknown): string[] {
  const out: string[] = [];
  // A break with no space after it is inside a token (a URL's "?"): keep it with the next piece.
  const joined: string[] = [];
  let carry = '';
  for (const { segment: s } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(String(text))) {
    carry += s;
    if (/\s$/.test(s)) { joined.push(carry); carry = ''; }
  }
  if (carry) joined.push(carry);
  for (const s of joined) {
    // A sentence with no full stop (a list, a table) would be one huge clip that takes
    // seconds to render; cut it at a word near 400 characters.
    out.push(...(s.match(/[\s\S]{1,400}(\s|$)|\S+/g) || []));
  }
  return out.map((t) => t.trim()).filter(Boolean);
}
