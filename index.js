// メモを保存・検索するだけの、最小の MCP サーバー。
//
// MCP の3つのプリミティブを1つずつ持たせてある。
//   Tools     … モデルが判断して呼ぶ        → add_note / search_notes
//   Resources … AI アプリが取得してモデルに渡す → notes://all
//   Prompts   … ユーザーが明示的に選ぶ        → weekly_review
//
// メモは JSON ファイル1本に保存する。外部システムへは一切繋がない。

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const NOTES_FILE = resolve(process.env.NOTES_FILE ?? `${here}/notes.json`);

async function loadNotes() {
  try {
    return JSON.parse(await readFile(NOTES_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveNotes(notes) {
  await writeFile(NOTES_FILE, `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
}

const server = new McpServer({
  name: 'notes',
  version: '1.0.0',
});

// --- Tools：モデルが「今これを呼ぶべきだ」と判断して呼ぶ -----------------

server.registerTool(
  'add_note',
  {
    title: 'メモを追加する',
    description:
      'メモを1件保存する。打ち合わせの決定事項や、あとで思い出したいことを記録するときに使う。',
    inputSchema: z.object({
      text: z.string().describe('保存する本文'),
      tags: z.array(z.string()).optional().describe('分類用のタグ（任意）'),
    }),
  },
  async ({ text, tags }) => {
    const notes = await loadNotes();
    const note = {
      id: notes.length + 1,
      text,
      tags: tags ?? [],
      createdAt: new Date().toISOString(),
    };
    notes.push(note);
    await saveNotes(notes);
    return {
      content: [{ type: 'text', text: `メモ #${note.id} を保存しました。` }],
    };
  }
);

server.registerTool(
  'search_notes',
  {
    title: 'メモを検索する',
    description:
      '保存済みのメモをキーワードで検索する。本文とタグの両方を対象にする。',
    inputSchema: z.object({
      keyword: z.string().describe('検索キーワード'),
    }),
  },
  async ({ keyword }) => {
    const notes = await loadNotes();
    const needle = keyword.toLowerCase();
    const hits = notes.filter(
      (n) =>
        n.text.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.toLowerCase().includes(needle))
    );
    if (hits.length === 0) {
      return {
        content: [{ type: 'text', text: `「${keyword}」に一致するメモはありません。` }],
      };
    }
    const lines = hits.map((n) => `#${n.id} [${n.createdAt.slice(0, 10)}] ${n.text}`);
    return {
      content: [{ type: 'text', text: `${hits.length}件見つかりました。\n${lines.join('\n')}` }],
    };
  }
);

// --- Resources：AI アプリが取得して、モデルに渡す ------------------------

server.registerResource(
  'all-notes',
  'notes://all',
  {
    title: '保存済みのメモ全件',
    description: 'これまでに保存したメモを JSON で返す。',
    mimeType: 'application/json',
  },
  async (uri) => {
    const notes = await loadNotes();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(notes, null, 2),
        },
      ],
    };
  }
);

// --- Prompts：ユーザーが明示的に選ぶ。自動では起動しない ------------------

server.registerPrompt(
  'weekly_review',
  {
    title: '今週のふりかえり',
    description: '保存済みのメモを読んで、今週のふりかえりを組み立てる。',
    argsSchema: z.object({
      focus: z.string().optional().describe('特に見たい観点（任意）'),
    }),
  },
  ({ focus }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'notes://all を読んで、直近のメモをふりかえってください。',
            ...(focus ? [`特に「${focus}」の観点で見てください。`] : []),
            '',
            '出力は次の3つに分けてください。',
            '1. 決まったこと',
            '2. まだ決まっていないこと',
            '3. 来週いちばん先に着手すべきこと（1つだけ）',
          ].join('\n'),
        },
      },
    ],
  })
);

// --- 起動 ----------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout は MCP の通信路なので、ログは必ず stderr に出す。
console.error(`notes MCP サーバーを起動しました（保存先: ${NOTES_FILE}）`);
