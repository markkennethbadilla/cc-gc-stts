import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchStt, launchTts, REQUEST_TIMEOUT_MS } from './daemon-client.ts';
import { CONVERSATION_ENDED, NO_SPEECH, DEFAULT_IDLE_SEC, LISTEN_CONTINUES, STOPPED, BACKGROUND_RESULT } from './protocol.ts';
import { loadText, toParts } from './read-aloud.ts';

const ENDED_NOTE =
  ` If the reply is exactly ${CONVERSATION_ENDED}, he pressed End conversation: the ` +
  'window has already shut down, so do not speak, do not call stt or tts again, and stop.';

// Spec 010.
const NO_SPEECH_NOTE =
  ` If the reply is exactly ${NO_SPEECH}, he has said nothing yet within idleSec: the window ` +
  'is still open and listening. If a background result has finished, relay it with tts (listen=true); ' +
  'otherwise call stt again without speaking. It never means the conversation ended.' +
  ` If the reply is exactly ${BACKGROUND_RESULT}, a background agent just finished: relay its result now with tts (listen=true). ` +
  'Anything he was saying is kept for that listen.';

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

const listenFor = (idle: number | undefined, timeoutMs: number, ack?: number) =>
  timeoutMs < MIN_LISTEN_MS
    ? Promise.resolve(LISTEN_CONTINUES)
    : launchStt({
        title: 'Type or dictate',
        action: 'Send',
        initialText: '',
        startRecording: false,
        idleSec: idle ?? DEFAULT_IDLE_SEC,
        timeoutMs,
        ack,
      });

// Spec 015. Waiting for him is itself a listen: a sleep or any other blocking
// tool leaves him talking to an agent that cannot answer until it returns.
const NO_SLEEP_NOTE =
  ' Never sleep or block on another tool to wait for him: to wait, call stt again (the default ' +
  `idleSec, ${DEFAULT_IDLE_SEC}, is already the longest), so you answer the moment he stops talking. ` +
  'Use the default idleSec for every normal wait: a background result arrives on its own and interrupts the listen. ' +
  // Spec 026.
  'A message he types into the chat mid-loop (usually something too long to say) is a turn, not an exit: handle it, answer by voice, and go straight back to listening. Typing never ends the conversation.';
// Spec 044: strict turns. The daemon numbers turns, joins a cut sentence, drops
// repeats and stale speech, and refuses a listen while a returned turn is unanswered.
const TURN_NOTE =
  ' Every heard turn starts with [turn N, heard HH:MM:SS to HH:MM:SS]. The protocol is listen, answer that exact turn at once, listen: ' +
  'your next call must be tts with listen=true answering turn N; an stt before you answer is refused. If turn N needs no spoken answer ' +
  '(not meant for you, or your answer would only repeat your last reply), call stt with ack=N instead. Do not ask him to finish a sentence: ' +
  'the window already joins a sentence cut mid-thought before returning it, never returns the same speech twice, and drops speech said ' +
  'while you were working or speaking, so what you get is current and complete. ' +
  // Spec 045
  'Mark hears a chime when the listen opens (the listen only opens after it, so a reply always comes after the chime and you never speak over it), ' +
  'a tick when his turn is captured, and a two-tone when a background result ends a listen; the window shows the same as a coloured banner. ' +
  'Do not announce "listening" or "got it" yourself.';

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
      TURN_NOTE,
    inputSchema: {
      idleSec,
      ack: z.number().int().optional().describe('Turn id you are deliberately not answering aloud (spec 044). Without it, an stt right after a returned turn is refused.'),
    },
  },
  async ({ idleSec, ack }) => reply(await listenFor(idleSec, CALL_BUDGET_MS, ack))
);

server.registerTool(
  'tts',
  {
    description:
      'Speak aloud in the voice window. Pass the words as text, or, to read out content that already ' +
      'exists (a story, a chapter, notes, a document), pass file (a local path) or url (plain text or ' +
      'markdown, not an HTML page) instead of copying it into text: the server reads and speaks it, so ' +
      'you do not spend output on it. Markdown files are read without their markup. Long content is ' +
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
      TURN_NOTE,
    inputSchema: {
      text: z.string().optional().describe('The text to speak. Give exactly one of text, file or url.'),
      file: z.string().optional().describe('Local path of a text or markdown file to read aloud, instead of text.'),
      url: z.string().optional().describe('URL of plain text or markdown to read aloud, instead of text.'),
      part: z.number().int().min(1).optional().describe('Start at this part of long content (1 is the start). Use the number a previous call returned.'),
      listen: z.boolean().optional().describe('After speaking, listen and return the next transcript'),
      close: z.boolean().optional().describe('Close the voice window after speaking. Use on the last message of a conversation, never with listen.'),
      rate: z.number().min(0.5).max(2).optional().describe('Speaking rate for this voice window only, from this call until it closes (1 is normal). Never saved as his default. Omit unless the user asks for a speed change; omitting keeps his saved setting.'),
      volume: z.number().min(0).max(1).optional().describe('Volume 0 to 1 for this voice window only, from this call until it closes. Never saved as his default. Omit unless the user asks for a volume change; omitting keeps his saved setting.'),
      idleSec,
    },
  },
  async ({ text, file, url, part, listen, close, idleSec, rate, volume }) => {
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
        rate,
        volume,
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
    return note ? reply(heard, note) : reply(heard);
  }
);

await server.connect(new StdioServerTransport());
