// Spec 013. Content passed to tts by reference (a file or a URL), so the agent
// never re-types a story, a chapter or study notes as output tokens.
import { readFile } from 'node:fs/promises';
import removeMarkdown from 'remove-markdown';

// About a minute of speech at the normal rate. Small enough that one part never
// comes near the request bound, large enough that the gaps between parts are rare.
export const PART_CHARS = 1000;

export async function loadText(file?: string, url?: string): Promise<string> {
  let raw: string;
  let markdown = false;
  if (file) {
    raw = await readFile(file, 'utf-8');
    markdown = /\.(md|markdown|mdx)$/i.test(file);
  } else if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`fetching ${url} returned ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (/html/i.test(type)) {
      throw new Error(
        `${url} is an HTML page, which would be read out as markup. Save its text to a file (for example with firecrawl scrape) and pass file instead.`
      );
    }
    raw = await res.text();
    markdown = /markdown/i.test(type) || /\.(md|markdown)(\?|#|$)/i.test(url);
  } else {
    throw new Error('pass text, file or url');
  }
  // Plain text is left as it is: remove-markdown would eat a line that starts with "1." or "-".
  return markdown ? removeMarkdown(raw) : raw;
}

// Sentence boundaries from the platform (Intl.Segmenter), packed into parts of
// at most PART_CHARS. A single sentence longer than that is cut at a space.
export function toParts(text: string, max = PART_CHARS): string[] {
  const parts: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) parts.push(cur.trim()); cur = ''; };
  const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const { segment } of seg.segment(text.replace(/\r\n?/g, '\n'))) {
    let s = segment;
    while (s.length > max) {
      push();
      const cut = s.lastIndexOf(' ', max) > 0 ? s.lastIndexOf(' ', max) : max;
      parts.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if (cur.length + s.length > max) push();
    cur += s;
  }
  push();
  return parts.filter(Boolean);
}
