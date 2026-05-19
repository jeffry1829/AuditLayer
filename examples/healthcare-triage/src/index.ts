import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLogger } from '@auditlayer/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = resolve(__dirname, '../audit-logs');
mkdirSync(auditDir, { recursive: true });

const audit = new AuditLogger({
  systemId: 'healthcare-triage-example',
  storage: { type: 'local', dir: auditDir },
  signingKey: {
    kind: 'inline',
    secret: process.env.AUDIT_SIGNING_KEY ?? 'demo-secret-key-not-for-production-1234567890',
  },
  hashChain: { enabled: true, algorithm: 'sha256' },
  piiRedaction: {
    enabled: true,
    strategy: 'pseudonymize',
    patterns: { email: true, phone: true, nhsNumber: true, name: true, address: true },
    tokenStore: { type: 'memory' },
  },
  retention: { minimumDays: 180, targetDays: 3650 },
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

function triage(p: Patient): TriageOutput {
  const hasRed = p.symptoms.some((s) => /chest pain|shortness of breath|stroke/.test(s));
  if (hasRed && p.vitals.spo2 < 94) {
    return {
      triageLevel: 1,
      recommendation: 'immediate',
      confidence: 0.92,
      reasonCodes: ['RED_FLAG_SYMPTOM', 'LOW_SPO2'],
    };
  }
  if (hasRed) {
    return {
      triageLevel: 2,
      recommendation: 'urgent',
      confidence: 0.78,
      reasonCodes: ['RED_FLAG_SYMPTOM'],
    };
  }
  return { triageLevel: 4, recommendation: 'routine', confidence: 0.6, reasonCodes: ['ROUTINE'] };
}

async function main() {
  for (const p of patients) {
    const callId = await audit.startCall({
      caseId: p.encounterId,
      modelProvider: 'self_hosted',
      modelName: 'triage-cdsm-2026',
      modelVersion: '2.4.1',
      modelConfiguration: { confidenceThreshold: 0.6 },
      promptTemplateId: 'triage-policy-v4',
      promptTemplateVersion: '4.0.0',
      operatorId: 'cdsm-service',
      referenceDatabase: 'BNF-edition-2026/Q2',
      input: { ...p },
    });
    const out = triage(p);
    await audit.endCall(callId, {
      outputDecision: out,
      reasonCodes: out.reasonCodes,
      riskFlags: out.confidence < 0.7 ? ['low_confidence'] : undefined,
      humanReview:
        out.triageLevel <= 2
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
