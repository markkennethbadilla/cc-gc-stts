// Spec 008. The one marker that means "he pressed End conversation".
//
// It lives in a module both the daemon and the MCP server import, because the
// daemon produces it and the server tells the agent what it means: two copies of
// this string would eventually become two different strings, and the indicator
// would silently go back to being an empty reply that nobody can read.
export const CONVERSATION_ENDED = '__STTS_CONVERSATION_ENDED__';

// Spec 010. A listen that heard nothing for its idleSec answers this, so the agent
// gets its turn back (to relay a finished background result) instead of waiting
// on a silent room. It is not an end: the window stays open and listening.
export const NO_SPEECH = '__STTS_NO_SPEECH__';

// Spec 017. The longest listen the tool schema allows (max 200), under the 240 s
// call budget. Every empty return is a full model round trip over the whole
// context, so a short default (it was 20) burned tokens on a silent room, and an
// agent with a stale schema cannot pass a longer one. Agents always use this
// default: a finished background agent ends the listen with BACKGROUND_RESULT (spec 043).
export const DEFAULT_IDLE_SEC = 200;

// Spec 012. A listen reached the tool call's time limit (the client has to return
// before the gateway gives up). Nothing he said is lost: the window keeps it, and
// the next stt (or tts with listen) returns it. Call stt again at once.
export const LISTEN_CONTINUES = '__STTS_LISTEN_CONTINUES__';

// Spec 013, 016. He pressed the stop button. A reading stops here instead of going on.
export const STOPPED = '__STTS_STOPPED__';

// Spec 043. A background agent finished while a listen was open. The listen ends at
// once so the agent can speak the result now; what Mark was mid-way through saying
// is kept by the window for the next listen, as at the time limit.
export const BACKGROUND_RESULT = '__STTS_BACKGROUND_RESULT__';

// Spec 019 (Mark 2026-09-30): "never cut me off." Speech whose last word is a
// connector, a filler, a preposition, an article, or a lead-in ("so I was
// thinking") reads unfinished. The same list is in stts_ui.html and in the
// call bot's turn.mjs (rule 67). ponytail: fixed word list; add a word when a
// live cut-off shows one.
export const UNFINISHED_END = new Set(
  ('and or but so because cause like um uh er erm hmm the a an to of with for from in on at by into about ' +
    'if that which who whose when while where what how as than then also just maybe my your our their his her its ' +
    "is are was were be i we you he she they it's i'm thinking wondering saying guess mean know said").split(' ')
);
export function readsUnfinished(text: string): boolean {
  const words = String(text).toLowerCase().replace(/[^a-z' ]+/g, ' ').trim().split(/\s+/);
  return UNFINISHED_END.has(words[words.length - 1]);
}
