import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchStt, launchTts, REQUEST_TIMEOUT_MS } from './daemon-client.ts';
import { CONVERSATION_ENDED, NO_SPEECH, DEFAULT_IDLE_SEC, LISTEN_CONTINUES, STOPPED, readsUnfinished } from './protocol.ts';
import { loadText, toParts } from './read-aloud.ts';

const ENDED_NOTE =
  ` If the reply is exactly ${CONVERSATION_ENDED}, he pressed End conversation: the ` +
  'window has already shut down, so do not speak, do not call stt or tts again, and stop.';

// Spec 010.
const NO_SPEECH_NOTE =
  ` If the reply is exactly ${NO_SPEECH}, he has said nothing yet within idleSec: the window ` +
  'is still open and listening. If a background result has finished, relay it with tts (listen=true); ' +
  'otherwise call stt again without speaking. It never means the conversation ended.';

// Spec 012.
const CONTINUES_NOTE =
  ` If the reply is exactly ${LISTEN_CONTINUES}, the listen reached the tool-call time limit, usually ` +
  'because he is still talking. Nothing he said is lost: call stt again at once, without speaking, ' +
  'and it returns everything he said.';

// Spec 012. One tool call, tts and its listen together, returns inside this, so
// the gateway (about 300 s) never gives up on it first.
const CALL_BUDGET_MS = REQUEST_TIMEOUT_MS;
// Spec 013. No new part of a reading starts after this; the rest is a follow-up call.
const READ_BUDGET_MS = CALL_BUDGET_MS / 2;
// Less than this left is not worth opening a listen for.
const MIN_LISTEN_MS = Math.min(5_000, CALL_BUDGET_MS / 10);

const idleSec = z
  .number()
  .min(0)
  .max(200)
  .optional()
  .describe(
    `Seconds to wait for speech before returning ${NO_SPEECH} (default ${DEFAULT_IDLE_SEC}, 0 waits until he speaks).`
  );

const listenFor = (idle: number | undefined, timeoutMs: number) =>
  timeoutMs < MIN_LISTEN_MS
    ? Promise.resolve(LISTEN_CONTINUES)
    : launchStt({
        title: 'Type or dictate',
        action: 'Send',
        initialText: '',
        startRecording: false,
        idleSec: idle ?? DEFAULT_IDLE_SEC,
        timeoutMs,
      });

// Spec 015. Waiting for him is itself a listen: a sleep or any other blocking
// tool leaves him talking to an agent that cannot answer until it returns.
const NO_SLEEP_NOTE =
  ' Never sleep or block on another tool to wait for him: to wait, call stt again (the default ' +
  `idleSec, ${DEFAULT_IDLE_SEC}, is already the longest), so you answer the moment he stops talking. ` +
  'Use the default idleSec for every normal wait: a background result arrives on its own and interrupts the listen. ' +
  'The one exception (spec 023): a listen made only because a turn reads unfinished passes idleSec 1.';
// Spec 019: a turn is sent after 0.7 s of quiet (2.2 s when it trails off), and the agent
// judges whether the thought is finished; when unsure, it listens again rather than answer.
const midThought = (again: string) =>
  ' A turn can arrive mid-thought. If the transcript reads unfinished (trails off, ends on a connector ' +
  `like 'and', 'so', 'but', 'because', 'like', 'um', a half sentence, or a dangling clause), do not answer; ${again} with idleSec 1 and join the pieces. ` +
  `If that short listen returns ${NO_SPEECH}, he has finished: answer what you have. Answer only when the thought is complete enough.`;
// Spec 019: the returned text says so too, when its last word reads unfinished.
const UNFINISHED_NOTE =
  `This reads unfinished (it ends mid-thought). Unless it is clearly complete, do not answer: listen again with idleSec 1 and join the pieces; if that returns ${NO_SPEECH}, answer what you have.`;
const heardReply = (heard: string, ...more: string[]) =>
  reply(heard, ...(readsUnfinished(heard) && !heard.startsWith('__STTS_') ? [UNFINISHED_NOTE] : []), ...more);

const reply = (...texts: string[]) => ({ content: texts.map((text) => ({ type: 'text' as const, text })) });

const server = new McpServer({ name: 'stts-mcp', version: '1.0.0' });

server.registerTool(
  'stt',
  {
    description:
      'Show the speech-to-text dialog and return the transcribed text the user spoke.' +
      ENDED_NOTE +
      NO_SPEECH_NOTE +
      CONTINUES_NOTE +
      NO_SLEEP_NOTE +
      midThought('call stt again'),
    inputSchema: { idleSec },
  },
  async ({ idleSec }) => heardReply(await listenFor(idleSec, CALL_BUDGET_MS))
);

server.registerTool(
  'tts',
  {
    description:
      'Speak aloud in the voice window. Pass the words as text, or, to read out content that already ' +
      'exists (a story, a chapter, notes, a document), pass file (a local path) or url (plain text or ' +
      'markdown, not an HTML page) instead of copying it into text: the server reads and speaks it, so ' +
      'you do not spend output on it. Use only periods, sparingly, one at the end of each complete thought: ' +
      'no commas, colons, semicolons, dashes or parentheses, since each is an audible pause in this ' +
      'voice. Replace them with connector words (and, so, then, but, because, which), never just drop them. Markdown files are read without their markup. Long content is ' +
      'read in parts; if the call returns before the end, it says which part to pass next. The Stop ' +
      'button stops the reading and it says where. No spoken word is a command, and talking over ' +
      'your voice does not stop it: it finishes, and his words come back on the next listen. With ' +
      'listen=true it then opens speech-to-text at once and returns what the user said next, saving ' +
      'a round trip per turn. Open fast: send a short first piece (3 to 6 words) without listen, then ' +
      'the rest in one call with listen. At most two pieces per reply.' +
      ENDED_NOTE +
      NO_SPEECH_NOTE +
      CONTINUES_NOTE +
      NO_SLEEP_NOTE +
      midThought('listen again (stt)'),
    inputSchema: {
      text: z.string().optional().describe('The text to speak. Give exactly one of text, file or url.'),
      file: z.string().optional().describe('Local path of a text or markdown file to read aloud, instead of text.'),
      url: z.string().optional().describe('URL of plain text or markdown to read aloud, instead of text.'),
      part: z.number().int().min(1).optional().describe('Start at this part of long content (1 is the start). Use the number a previous call returned.'),
      listen: z.boolean().optional().describe('After speaking, listen and return the next transcript'),
      close: z.boolean().optional().describe('Close the voice window after speaking. Use on the last message of a conversation, never with listen.'),
      idleSec,
    },
  },
  async ({ text, file, url, part, listen, close, idleSec }) => {
    const t0 = Date.now();
    const left = () => CALL_BUDGET_MS - (Date.now() - t0);
    if ([text, file, url].filter((v) => v !== undefined).length !== 1) {
      throw new Error('give exactly one of text, file or url');
    }
    const byRef = text === undefined;
    const parts = toParts(byRef ? await loadText(file, url) : (text as string));
    if (!parts.length && byRef) throw new Error('there is nothing to read in it');
    const first = (part ?? 1) - 1;
    if (part !== undefined && first >= parts.length) throw new Error(`part ${part} is past the end: it has ${parts.length} parts`);

    let i = first;
    let stopped = false;
    for (; i < parts.length; i++) {
      if (i > first && Date.now() - t0 > READ_BUDGET_MS) break;
      const last = i === parts.length - 1;
      const r = await launchTts({
        title: 'Speak',
        action: 'Stop & Exit',
        text: parts[i],
        oneshot: true,
        close: !!close && !listen && last,
        timeoutMs: left(),
      });
      if (r === STOPPED) { stopped = true; break; }
    }

    const n = parts.length;
    const where = file ? 'the same file' : url ? 'the same url' : 'the same text';
    let note = '';
    if (stopped) {
      note = n > 1 ? `He stopped it during part ${i + 1} of ${n}. To resume there, call tts with ${where} and part=${i + 1}.` : 'He stopped it.';
    } else if (i < n) {
      // Out of time before the end: hand back so the gateway does not give up, no listen in between.
      return reply(`Read parts ${first + 1} to ${i} of ${n}. To go on, call tts again with ${where} and part=${i + 1}.`);
    } else if (n > 1 || byRef) {
      note = `Read to the end (part ${n} of ${n}).`;
    }

    if (!listen) return reply(note || 'Spoken.');
    const heard = await listenFor(idleSec, left());
    return note ? heardReply(heard, note) : heardReply(heard);
  }
);

await server.connect(new StdioServerTransport());
