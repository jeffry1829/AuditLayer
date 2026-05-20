"""Resume-screening example — Python parity with ``examples/resume-screening`` (TS).

Run locally:

    cd python
    pip install -e .
    AUDIT_SIGNING_KEY=$(openssl rand -hex 32) python examples/resume_screening.py

Then verify the chain with either CLI:

    auditlayer --system-id resume-screener-py \
               --storage-dir python/examples/audit-logs verify

    # or the TypeScript CLI; same chain semantics
    npx @auditlayer/cli --system-id resume-screener-py \
        --storage-dir python/examples/audit-logs verify
"""

from __future__ import annotations

import json
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path

from auditlayer import (
    AuditLogger,
    InlineSigner,
    InMemoryPiiTokenStore,
    LocalStorageBackend,
    PiiRedactor,
    WrapContext,
)

AUDIT_DIR = Path(__file__).resolve().parent / "audit-logs"


@dataclass(frozen=True)
class ResumeScoringConfig:
    prompt_template_id: str
    prompt_template_version: str
    model_name: str
    model_max_tokens: int
    model_temperature: float
    recommend_threshold: int
    base_score: int
    max_score: int
    positive_keywords: tuple[str, ...]


RESUME_SCORING = ResumeScoringConfig(
    prompt_template_id="resume-scoring-v3",
    prompt_template_version="3.2.1",
    model_name="claude-3-5-sonnet-20241022",
    model_max_tokens=256,
    model_temperature=0.1,
    recommend_threshold=7,
    base_score=5,
    max_score=10,
    positive_keywords=("PostgreSQL", "Kubernetes", "compliance", "AI", "React"),
)


def _compute_mock_score(text: str, cfg: ResumeScoringConfig) -> int:
    score = cfg.base_score
    for kw in cfg.positive_keywords:
        if kw in text:
            score += 1
    return min(cfg.max_score, score)


class _MockMessages:
    def __init__(self, cfg: ResumeScoringConfig) -> None:
        self._cfg = cfg

    def create(self, **params):
        messages = params.get("messages") or []
        resume_text = messages[0]["content"] if messages else ""
        score = _compute_mock_score(resume_text, self._cfg)
        return {
            "id": f"msg_{random.randint(10**9, 10**10 - 1):x}",
            "model": params.get("model"),
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "score": score,
                            "recommended": score >= self._cfg.recommend_threshold,
                        },
                    ),
                },
            ],
            "usage": {"input_tokens": 120, "output_tokens": 18},
        }


class _MockAnthropicClient:
    """Fresh per-call wrapper around a shared messages backend.

    ``audit.wrap`` mutates ``client.messages.create`` in place. To avoid
    accumulating layers across candidates (each candidate appending another
    wrapper to the same callable), each candidate gets its own client
    instance whose ``messages`` attribute is a fresh proxy. The TS example
    uses the same pattern (``audit.wrap({ messages: { create: mock... } })``).
    """

    def __init__(self, backing: _MockMessages) -> None:
        class _Proxy:
            create = staticmethod(backing.create)

        self.messages = _Proxy()


CANDIDATES = (
    {
        "id": "candidate-12345",
        "name": "Alice Smith",
        "email": "alice@example.com",
        "phone": "+1 555 123 4567",
        "summary": "8y backend engineer, PostgreSQL, Kubernetes, EU-located.",
    },
    {
        "id": "candidate-67890",
        "name": "Bob Tanaka",
        "email": "bob.tanaka@example.com",
        "phone": "+44 20 7946 0958",
        "summary": "Recent grad, strong React portfolio, three internships.",
    },
    {
        "id": "candidate-24680",
        "name": "Carla Müller",
        "email": "c.mueller@example.de",
        "phone": "+49 30 123456",
        "summary": "12y compliance background, AI policy specialization.",
    },
)


def main() -> int:
    signing_secret = os.environ.get("AUDIT_SIGNING_KEY")
    if not signing_secret:
        sys.stderr.write(
            "AUDIT_SIGNING_KEY env var is required. Set a 16+ character secret to "
            "run the example.\n",
        )
        return 2

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    store = InMemoryPiiTokenStore()
    audit = AuditLogger(
        system_id="resume-screener-py",
        storage=LocalStorageBackend(dir=str(AUDIT_DIR)),
        signer=InlineSigner(signing_secret),
        pii_redactor=PiiRedactor(
            enabled=True,
            patterns={"email": True, "phone": True, "name": True},
            token_store=store,
        ),
        pii_token_store=store,
    )

    backing = _MockMessages(RESUME_SCORING)
    for candidate in CANDIDATES:
        client = _MockAnthropicClient(backing)
        audit.wrap(
            client,
            WrapContext(
                case_id=candidate["id"],
                prompt_template_id=RESUME_SCORING.prompt_template_id,
                prompt_template_version=RESUME_SCORING.prompt_template_version,
                operator_id="system",
            ),
        )
        resp = client.messages.create(
            model=RESUME_SCORING.model_name,
            max_tokens=RESUME_SCORING.model_max_tokens,
            temperature=RESUME_SCORING.model_temperature,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Score this candidate for the EU backend role.\n\n"
                        f"Name: {candidate['name']}\n"
                        f"Email: {candidate['email']}\n"
                        f"Phone: {candidate['phone']}\n\n"
                        f"{candidate['summary']}"
                    ),
                },
            ],
        )
        body = json.loads(resp["content"][0]["text"])
        print(f"[{candidate['id']}] score={body['score']} recommended={body['recommended']}")

    audit.close()
    print(f"\nAudit logs written to: {AUDIT_DIR}")
    print(
        f"Run: auditlayer --system-id resume-screener-py "
        f"--storage-dir {AUDIT_DIR} verify",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
