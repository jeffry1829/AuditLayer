import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger, RETENTION_DEFAULTS } from '@auditlayer/sdk';

import { TRIAGE_POLICY, type TriagePolicyConfig } from './config.js';

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
  systemId: 'healthcare-triage-example',
  storage: { type: 'local', dir: auditDir },
  signingKey: { kind: 'inline', secret: signingSecret },
  hashChain: { enabled: true, algorithm: 'sha256' },
  piiRedaction: {
    enabled: true,
    strategy: 'pseudonymize',
    patterns: { email: true, phone: true, nhsNumber: true, name: true, address: true },
    tokenStore: { type: 'memory' },
  },
  retention: {
    minimumDays: RETENTION_DEFAULTS.deployerMinimumDays,
    targetDays: TRIAGE_POLICY.retentionTargetDays,
  },
});

interface Patient {
  encounterId: string;
  patientNhs: string;
  patientName: string;
  age: number;
  symptoms: string[];
  vitals: { hr: number; bp: string; spo2: number };
}

const patients: Patient[] = [
  {
    encounterId: 'enc-1001',
    patientNhs: '123 456 7890',
    patientName: 'Daniela Costa',
    age: 67,
    symptoms: ['chest pain', 'shortness of breath'],
    vitals: { hr: 112, bp: '150/95', spo2: 92 },
  },
  {
    encounterId: 'enc-1002',
    patientNhs: '987 654 3210',
    patientName: 'Esther Cohen',
    age: 34,
    symptoms: ['headache'],
    vitals: { hr: 78, bp: '120/80', spo2: 98 },
  },
];

interface TriageOutput {
  triageLevel: 1 | 2 | 3 | 4 | 5;
  recommendation: 'immediate' | 'urgent' | 'standard' | 'routine' | 'self-care';
  confidence: number;
  reasonCodes: string[];
}

function hasRedFlagSymptom(symptoms: string[], policy: TriagePolicyConfig): boolean {
  return symptoms.some((s) => policy.redFlagSymptomPatterns.some((re) => re.test(s)));
}

function triage(p: Patient, policy: TriagePolicyConfig): TriageOutput {
  const hasRed = hasRedFlagSymptom(p.symptoms, policy);
  if (hasRed && p.vitals.spo2 < policy.spo2RedFlagThreshold) {
    return {
      triageLevel: 1,
      recommendation: 'immediate',
      confidence: policy.redFlagLowSpo2Confidence,
      reasonCodes: ['RED_FLAG_SYMPTOM', 'LOW_SPO2'],
    };
  }
  if (hasRed) {
    return {
      triageLevel: 2,
      recommendation: 'urgent',
      confidence: policy.redFlagAloneConfidence,
      reasonCodes: ['RED_FLAG_SYMPTOM'],
    };
  }
  return {
    triageLevel: policy.defaultLevel,
    recommendation: 'routine',
    confidence: policy.defaultConfidence,
    reasonCodes: ['ROUTINE'],
  };
}

async function main() {
  for (const p of patients) {
    const callId = await audit.startCall({
      caseId: p.encounterId,
      modelProvider: 'self_hosted',
      modelName: 'triage-cdsm-2026',
      modelVersion: '2.4.1',
      modelConfiguration: {
        confidenceThreshold: TRIAGE_POLICY.lowConfidenceThreshold,
        policyVersion: TRIAGE_POLICY.policyVersion,
      },
      promptTemplateId: 'triage-policy-v4',
      promptTemplateVersion: TRIAGE_POLICY.policyVersion,
      operatorId: 'cdsm-service',
      referenceDatabase: TRIAGE_POLICY.referenceDatabase,
      input: { ...p },
    });
    const out = triage(p, TRIAGE_POLICY);
    await audit.endCall(callId, {
      outputDecision: out,
      reasonCodes: out.reasonCodes,
      riskFlags:
        out.confidence < TRIAGE_POLICY.lowConfidenceThreshold ? ['low_confidence'] : undefined,
      humanReview:
        out.triageLevel <= TRIAGE_POLICY.humanReviewMaxLevel
          ? {
              reviewerId: 'clinician-on-call',
              reviewedAt: new Date().toISOString(),
              decision: 'approve',
              rationale: 'Clinician confirmed immediate / urgent recommendation.',
            }
          : undefined,
    });
    console.log(`[${p.encounterId}] level=${out.triageLevel} recommendation=${out.recommendation}`);
  }
  await audit.close();
  console.log(`\nAudit logs written to: ${auditDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
