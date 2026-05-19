import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { AuditLogger } from '@auditlayer/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = resolve(__dirname, '../audit-logs');
mkdirSync(auditDir, { recursive: true });

const audit = new AuditLogger({
  systemId: 'resume-screener-example',
  storage: { type: 'local', dir: auditDir },
  signingKey: {
    kind: 'inline',
    secret: process.env.AUDIT_SIGNING_KEY ?? 'demo-secret-key-not-for-production-1234567890',
  },
  hashChain: { enabled: true, algorithm: 'sha256' },
  piiRedaction: {
    enabled: true,
    strategy: 'pseudonymize',
    patterns: { email: true, phone: true, name: true },
    tokenStore: { type: 'memory' },
  },
});

// Mock Anthropic SDK shape (replace with @anthropic-ai/sdk in real usage)
const mockAnthropic = {
  messages: {
    create: async (params: Record<string, unknown>) => {
      const messages = params['messages'] as Array<{ content: string }> | undefined;
      const resumeText = messages?.[0]?.content ?? '';
      const score = computeMockScore(resumeText);
      return {
        id: `msg_${Math.random().toString(36).slice(2)}`,
        model: params['model'],
        content: [
          {
            type: 'text',
            text: JSON.stringify({ score, recommended: score >= 7 }),
          },
        ],
        usage: { input_tokens: 120, output_tokens: 18 },
      };
    },
  },
};

const candidates = [
  {
    id: 'candidate-12345',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '+1 555 123 4567',
    summary: '8y backend engineer, PostgreSQL, Kubernetes, EU-located.',
  },
  {
    id: 'candidate-67890',
    name: 'Bob Tanaka',
    email: 'bob.tanaka@example.com',
    phone: '+44 20 7946 0958',
    summary: 'Recent grad, strong React portfolio, three internships.',
  },
  {
    id: 'candidate-24680',
    name: 'Carla Müller',
    email: 'c.mueller@example.de',
    phone: '+49 30 123456',
    summary: '12y compliance background, AI policy specialization.',
  },
];

async function main() {
  for (const c of candidates) {
    // Re-wrap with the candidate-specific caseId for this single decision.
    const scoped = audit.wrap(
      { messages: { create: mockAnthropic.messages.create } },
      {
        caseId: c.id,
        promptTemplateId: 'resume-scoring-v3',
        promptTemplateVersion: '3.2.1',
        operatorId: 'system',
      },
    );

    const resp = await scoped.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 256,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content:
            `Score this candidate for the EU backend role.\n\n` +
            `Name: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone}\n\n${c.summary}`,
        },
      ],
    });
    const text = (resp.content as Array<{ text: string }>)[0]?.text ?? '{}';
    const parsed = JSON.parse(text) as { score: number; recommended: boolean };
    console.log(`[${c.id}] score=${parsed.score} recommended=${parsed.recommended}`);
  }
  await audit.close();
  console.log(`\nAudit logs written to: ${auditDir}`);
  console.log(
    `Run: npx @auditlayer/cli verify --system-id resume-screener-example --storage-dir ${auditDir}`,
  );
}

function computeMockScore(text: string): number {
  // Naive deterministic mock: keyword presence raises the score.
  const positives = ['PostgreSQL', 'Kubernetes', 'compliance', 'AI', 'React'];
  let score = 5;
  for (const k of positives) if (text.includes(k)) score += 1;
  return Math.min(10, score);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
