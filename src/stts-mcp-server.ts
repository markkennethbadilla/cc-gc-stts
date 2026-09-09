import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { launchStt, launchTts } from './daemon-client.ts';

const server = new McpServer({ name: 'stts-mcp', version: '1.0.0' });

server.registerTool(
  'stt',
  {
    description:
      'Show the speech-to-text dialog and return the transcribed text the user spoke.',
    inputSchema: {},
  },
  async () => {
    const text = await launchStt({
      title: 'Type or dictate',
      action: 'Send',
      initialText: '',
      startRecording: false,
    });
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'tts',
  {
    description:
      'Send a string to the text-to-speech dialog to be spoken aloud. With listen=true it then opens speech-to-text at once and returns what the user said next, saving a round trip per turn.',
    inputSchema: {
      text: z.string().describe('The text to speak'),
      listen: z.boolean().optional().describe('After speaking, listen and return the next transcript'),
      close: z.boolean().optional().describe('Close the voice window after speaking. Use on the last message of a conversation, never with listen.'),
    },
  },
  async ({ text, listen, close }) => {
    await launchTts({
      title: 'Speak',
      action: 'Stop & Exit',
      text,
      oneshot: true,
      close: !!close && !listen,
    });
    if (!listen) return { content: [{ type: 'text', text: 'Spoken.' }] };
    const heard = await launchStt({
      title: 'Type or dictate',
      action: 'Send',
      initialText: '',
      startRecording: false,
    });
    return { content: [{ type: 'text', text: heard }] };
  }
);

await server.connect(new StdioServerTransport());
