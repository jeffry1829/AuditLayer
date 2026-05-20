import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { AuditLogger } from '@auditlayer/sdk';

import { RESUME_SCORING, type ResumeScoringConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = resolve(__dirname, '../audit-logs');
mkdirSync(auditDir, { recursive: true });

const signingSecret = process.env.AUDIT_SIGNING_KEY;
if (!signingSecret) {
  console.error(
    'AUDIT_SIGNING_KEY env var is required. Set a 16+ character secret to run the example.',
  );
  process.exit(2);
}

const audit = new AuditLogger({
  systemId: 'resume-screener-example',
  storage: { type: 'local', dir: auditDir },
  signingKey: { kind: 'inline', secret: signingSecret },
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
      const score = computeMockScore(resumeText, RESUME_SCORING);
      return {
        id: `msg_${Math.random().toString(36).slice(2)}`,
        model: params['model'],
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              score,
              recommended: score >= RESUME_SCORING.recommendThreshold,
            }),
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
        promptTemplateId: RESUME_SCORING.promptTemplateId,
        promptTemplateVersion: RESUME_SCORING.promptTemplateVersion,
        operatorId: 'system',
      },
    );

    const resp = await scoped.messages.create({
      model: RESUME_SCORING.modelName,
      max_tokens: RESUME_SCORING.modelMaxTokens,
      temperature: RESUME_SCORING.modelTemperature,
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

function computeMockScore(text: string, cfg: ResumeScoringConfig): number {
  let score = cfg.baseScore;
  for (const k of cfg.positiveKeywords) if (text.includes(k)) score += 1;
  return Math.min(cfg.maxScore, score);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
