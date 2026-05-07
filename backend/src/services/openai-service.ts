import { config } from '../config';
import { prisma } from '../utils/db';

type ResponseContent = {
  type?: string;
  text?: string;
};

type ResponseOutput = {
  type?: string;
  content?: ResponseContent[];
};

type ResponsesApiBody = {
  output_text?: string;
  output?: ResponseOutput[];
  error?: { message?: string };
};

function extractOutputText(body: ResponsesApiBody): string {
  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text' && content.text)
    .map((content) => content.text)
    .join('\n')
    .trim();

  return text ?? '';
}

async function summaryPrompt(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { name: 'ai_due_summary_prompt' } });
  return setting?.value.trim() || config.AI_DUE_SUMMARY_PROMPT;
}

function sectionValue(input: string, label: string): string {
  const match = input.match(new RegExp(`${label}:?\\n([\\s\\S]*?)(?:\\n\\n[^\\n]+:?\\n|$)`));
  return match?.[1]?.trim() ?? '';
}

export async function createOpenAiSummary(input: string): Promise<string> {
  if (config.AI_DUE_SUMMARY_MOCK_OPENAI) {
    const subject = input.match(/#\d+\s+(.+)/)?.[1]?.trim() ?? '対象チケット';
    const description = sectionValue(input, '説明');
    const comments = sectionValue(input, 'コメント');
    return [
      `【モック要約】${subject}`,
      description ? `説明: ${description.slice(0, 160)}` : '説明: 記載なし',
      comments ? `コメント: ${comments.slice(0, 240)}` : 'コメント: 記載なし',
      '期限が近づいているため、上記の内容をもとに残作業と未解決事項を確認してください。',
    ].join('\n');
  }

  if (!config.OPENAI_API_KEY.trim()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      instructions: await summaryPrompt(),
      input,
      max_output_tokens: 800,
      store: false,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as ResponsesApiBody;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `OpenAI API request failed with status ${response.status}`);
  }

  const summary = extractOutputText(body);
  if (!summary) throw new Error('OpenAI API returned an empty summary');
  return summary;
}
