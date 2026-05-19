import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from '@auditlayer/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = resolve(__dirname, '../audit-logs');
mkdirSync(auditDir, { recursive: true });

const audit = new AuditLogger({
  systemId: 'credit-decision-example',
  storage: { type: 'local', dir: auditDir },
  signingKey: {
    kind: 'inline',
    secret: process.env.AUDIT_SIGNING_KEY ?? 'demo-secret-key-not-for-production-1234567890',
  },
  hashChain: { enabled: true, algorithm: 'sha256' },
  retention: { minimumDays: 180, targetDays: 2555 },
});

interface Applicant {
  applicationId: string;
  customerId: string;
  requestedAmount: number;
  income: number;
  existingDebt: number;
  creditScore: number;
}

const applicants: Applicant[] = [
  {
    applicationId: 'app-001',
    customerId: 'cust-1001',
    requestedAmount: 5000,
    income: 60000,
    existingDebt: 2000,
    creditScore: 720,
  },
  {
    applicationId: 'app-002',
    customerId: 'cust-1002',
    requestedAmount: 25000,
    income: 38000,
    existingDebt: 14000,
    creditScore: 612,
  },
  {
    applicationId: 'app-003',
    customerId: 'cust-1003',
    requestedAmount: 12000,
    income: 90000,
    existingDebt: 1000,
    creditScore: 805,
  },
];

interface CreditOutput {
  decision: 'approve' | 'decline' | 'escalate';
  limit: number;
  termMonths: number;
  aprBps: number;
  reasonCodes: string[];
}

function scoreApplicant(a: Applicant): CreditOutput {
  const dti = (a.existingDebt + a.requestedAmount * 0.05) / Math.max(1, a.income);
  if (a.creditScore < 640) {
    return {
      decision: 'decline',
      limit: 0,
      termMonths: 0,
      aprBps: 0,
      reasonCodes: ['LOW_CREDIT_SCORE'],
    };
  }
  if (dti > 0.45) {
    return {
      decision: 'escalate',
      limit: 0,
      termMonths: 0,
      aprBps: 0,
      reasonCodes: ['HIGH_DTI'],
    };
  }
  return {
    decision: 'approve',
    limit: a.requestedAmount,
    termMonths: 36,
    aprBps: a.creditScore >= 750 ? 750 : 1250,
    reasonCodes: ['CREDIT_OK', 'DTI_OK'],
  };
}

async function main() {
  for (const a of applicants) {
    const callId = await audit.startCall({
      caseId: a.applicationId,
      modelProvider: 'self_hosted',
      modelName: 'credit-scorecard',
      modelVersion: '2026-04',
      modelConfiguration: { policyVersion: '7.1' },
      promptTemplateId: 'credit-scoring-policy-v7',
      promptTemplateVersion: '7.1.0',
      operatorId: 'credit-engine',
      input: a,
    });
    const out = scoreApplicant(a);
    const needsReview = out.decision === 'escalate';
    await audit.endCall(callId, {
      outputDecision: out,
      reasonCodes: out.reasonCodes,
      humanReview: needsReview
        ? {
            reviewerId: 'credit-officer-12',
            reviewedAt: new Date().toISOString(),
            decision: 'override',
            rationale: 'Manual underwriting after escalation; offered reduced limit.',
            finalDecision: { ...out, decision: 'approve', limit: 8000, aprBps: 1500 },
          }
        : undefined,
      riskFlags: needsReview ? ['high_dti'] : undefined,
    });
    console.log(`[${a.applicationId}] decision=${out.decision} limit=${out.limit}`);
  }
  await audit.close();
  console.log(`\nAudit logs written to: ${auditDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
