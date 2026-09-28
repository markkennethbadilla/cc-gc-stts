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

// Spec 010. Long enough for a thinking pause before he starts talking, short
// enough that a finished background result is relayed within a turn.
export const DEFAULT_IDLE_SEC = 20;

// Spec 012. A listen reached the tool call's time limit (the client has to return
// before the gateway gives up). Nothing he said is lost: the window keeps it, and
// the next stt (or tts with listen) returns it. Call stt again at once.
export const LISTEN_CONTINUES = '__STTS_LISTEN_CONTINUES__';

// Spec 013. He stopped the speaking turn ("stop it", the stop button, or talking
// over it in headphone mode). A reading stops here instead of going on.
export const STOPPED = '__STTS_STOPPED__';
