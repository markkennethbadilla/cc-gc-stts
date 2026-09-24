// Spec 008. The one marker that means "he pressed End conversation".
//
// It lives in a module both the daemon and the MCP server import, because the
// daemon produces it and the server tells the agent what it means: two copies of
// this string would eventually become two different strings, and the indicator
// would silently go back to being an empty reply that nobody can read.
export const CONVERSATION_ENDED = '__STTS_CONVERSATION_ENDED__';
