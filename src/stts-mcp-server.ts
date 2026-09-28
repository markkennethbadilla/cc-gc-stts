import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchStt, launchTts } from './daemon-client.ts';
import { CONVERSATION_ENDED, NO_SPEECH, DEFAULT_IDLE_SEC } from './protocol.ts';

const ENDED_NOTE =
  ` If the reply is exactly ${CONVERSATION_ENDED}, he pressed End conversation: the ` +
  'window has already shut down, so do not speak, do not call stt or tts again, and stop.';

// Spec 010.
const NO_SPEECH_NOTE =
  ` If the reply is exactly ${NO_SPEECH}, he has said nothing yet within idleSec: the window ` +
  'is still open and listening. If a background result has finished, relay it with tts (listen=true); ' +
  'otherwise call stt again without speaking. It never means the conversation ended.';

const idleSec = z
  .number()
  .min(0)
  .max(200)
  .optional()
  .describe(
    `Seconds to wait for speech before returning ${NO_SPEECH} (default ${DEFAULT_IDLE_SEC}, 0 waits until he speaks).`
  );

const listenFor = (idle: number | undefined) =>
  launchStt({
    title: 'Type or dictate',
    action: 'Send',
    initialText: '',
    startRecording: false,
    idleSec: idle ?? DEFAULT_IDLE_SEC,
  });

const server = new McpServer({ name: 'stts-mcp', version: '1.0.0' });

server.registerTool(
  'stt',
  {
    description:
      'Show the speech-to-text dialog and return the transcribed text the user spoke.' +
      ENDED_NOTE +
      NO_SPEECH_NOTE,
    inputSchema: { idleSec },
  },
  async ({ idleSec }) => {
    const text = await listenFor(idleSec);
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'tts',
  {
    description:
      'Send a string to the text-to-speech dialog to be spoken aloud. With listen=true it then opens speech-to-text at once and returns what the user said next, saving a round trip per turn.' +
      ENDED_NOTE +
      NO_SPEECH_NOTE,
    inputSchema: {
      text: z.string().describe('The text to speak'),
      listen: z.boolean().optional().describe('After speaking, listen and return the next transcript'),
      close: z.boolean().optional().describe('Close the voice window after speaking. Use on the last message of a conversation, never with listen.'),
      idleSec,
    },
  },
  async ({ text, listen, close, idleSec }) => {
    await launchTts({
      title: 'Speak',
      action: 'Stop & Exit',
      text,
      oneshot: true,
      close: !!close && !listen,
    });
    if (!listen) return { content: [{ type: 'text', text: 'Spoken.' }] };
    const heard = await listenFor(idleSec);
    return { content: [{ type: 'text', text: heard }] };
  }
);

await server.connect(new StdioServerTransport());
