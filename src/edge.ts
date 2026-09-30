// Spec 034. The window's voice is Microsoft's online (Edge) voices, rendered here with
// edge-tts-universal, the same package and version as the call bot (callbot spec 007).
// The page cuts the text at punctuation (/edge/split), fetches up to three clips ahead
// (/edge/clip) and plays each without its leading and trailing silence.
import type http from 'node:http';
import { EdgeTTS, listVoices } from 'edge-tts-universal';
import { segment } from './clauses.ts';

// Edge sends 0.3-0.9 s of silence after the last word; keep this much so a
// punctuation pause still sounds natural (callbot TAIL_S).
const TAIL_S = 0.12;
const pct = (x: number) => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;
const num = (v: string | null, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

let voices: Promise<{ name: string; friendly: string; lang: string }[]> | null = null;

async function body(req: http.IncomingMessage) {
  let s = '';
  for await (const c of req) s += c;
  return s;
}

export async function handleEdge(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/edge/')) return false;
  try {
    if (url.pathname === '/edge/voices') {
      // All English locales, cached for the daemon's life; a failed list is retried next time.
      voices ??= listVoices().then((all) => all.filter((v) => v.Locale.startsWith('en-'))
        .map((v) => ({ name: v.ShortName, friendly: v.FriendlyName, lang: v.Locale })));
      voices.catch(() => { voices = null; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await voices));
      return true;
    }
    if (url.pathname === '/edge/split' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(segment(await body(req))));
      return true;
    }
    if (url.pathname === '/edge/clip') {
      const text = url.searchParams.get('text') || '';
      if (!text.trim()) throw new Error('no text');
      const voice = url.searchParams.get('voice') || 'en-US-AvaMultilingualNeural';
      const rate = num(url.searchParams.get('rate'), 0.5, 2, 1.3);
      const volume = num(url.searchParams.get('volume'), 0, 1, 1);
      const r = await new EdgeTTS(text, voice, { rate: pct(rate), volume: pct(volume) }).synthesize();
      const buf = Buffer.from(await r.audio.arrayBuffer());
      const w = r.subtitle;
      const from = w?.length ? w[0].offset / 1e7 : 0;
      const to = w?.length ? (w[w.length - 1].offset + w[w.length - 1].duration) / 1e7 + TAIL_S : 0;
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'X-Speech-From': String(from), 'X-Speech-To': String(to) });
      res.end(buf);
      return true;
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    // The page falls back to the browser's own voice on any failure.
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(String((err as Error)?.message || err));
  }
  return true;
}
