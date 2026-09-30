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
// default: a background result interrupts the listen on its own.
export const DEFAULT_IDLE_SEC = 200;

// Spec 012. A listen reached the tool call's time limit (the client has to return
// before the gateway gives up). Nothing he said is lost: the window keeps it, and
// the next stt (or tts with listen) returns it. Call stt again at once.
export const LISTEN_CONTINUES = '__STTS_LISTEN_CONTINUES__';

// Spec 013, 016. He pressed the stop button. A reading stops here instead of going on.
export const STOPPED = '__STTS_STOPPED__';
