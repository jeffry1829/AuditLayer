# Providers

Wrap raw LLM SDK clients with one call. Provider detection runs through a registry; you can register custom adapters too.

## Built-in adapters

| Provider  | Sync                                    | Async                                   |
| --------- | --------------------------------------- | --------------------------------------- |
| Anthropic | `messages.create` (TS + Python)         | `wrap_async(AsyncAnthropic())` (Python) |
| OpenAI    | `chat.completions.create` (TS + Python) | `wrap_async(AsyncOpenAI())` (Python)    |

The TS `wrap()` works on any client whose `messages.create` / `chat.completions.create` returns a Promise — sync and async are the same call in Node.

## Anthropic — TypeScript

```ts
import Anthropic from '@anthropic-ai/sdk';
import { AuditLogger } from '@vouchrail/sdk';

const audit = new AuditLogger({
  /* ... */
});
const anthropic = audit.wrap(new Anthropic(), {
  caseId: 'candidate-12345',
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  operatorId: 'system',
});

await anthropic.messages.create({
  /* ... */
});
```

The adapter forwards `temperature`, `top_p`, `top_k`, `max_tokens`, and `stop_sequences` into `modelConfiguration`. It pulls `id`, `model`, `content`, and `usage` from the response for the output snapshot. `modelVersion` is derived from the snapshot suffix on the model string (e.g., `claude-3-5-sonnet-20241022` → `20241022`).

## OpenAI — TypeScript

```ts
import OpenAI from 'openai';
const openai = audit.wrap(new OpenAI(), {
  caseId: 'loan-app-9876',
  promptTemplateId: 'credit-scoring-v2',
  promptTemplateVersion: '2.0.0',
  operatorId: 'system',
});
await openai.chat.completions.create({
  /* ... */
});
```

Forwards `temperature`, `top_p`, `max_tokens`, `frequency_penalty`, `presence_penalty`. Pulls `id`, `model`, `choices`, `usage`.

## Anthropic / OpenAI — Python sync

```python
from anthropic import Anthropic
from vouchrail import WrapContext

anthropic = audit.wrap(Anthropic(), WrapContext(
    case_id="candidate-12345",
    prompt_template_id="resume-scoring-v3",
    prompt_template_version="3.2.1",
    operator_id="system",
))
anthropic.messages.create(...)
```

OpenAI is identical with `OpenAI()` + `chat.completions.create(...)`.

## Python async — use `wrap_async`

```python
from anthropic import AsyncAnthropic

anthropic = audit.wrap_async(AsyncAnthropic(), WrapContext(...))
await anthropic.messages.create(...)
```

Async detection looks at `inspect.iscoroutinefunction(client.messages.create)`. Passing an async client to `wrap()` (or a sync client to `wrap_async()`) raises `VouchRailProviderError(PROVIDER_UNSUPPORTED_CLIENT)` rather than silently producing broken entries.

## Context manager (Python)

```python
with audit.case(case_id="candidate-12345", operator_id="system") as ctx:
    anthropic = audit.wrap(Anthropic(), ctx)
    ...
```

The context manager returns a `WrapContext` configured for that case scope. It does not itself emit an entry — the wrapped client's intercepted calls do.

## Decorator (Python)

```python
@audit.track(case_id_from=lambda candidate: candidate["id"])
def screen(candidate):
    return anthropic.messages.create(...)
```

Derives the case ID from the function's arguments. Works on `def` and `async def`.

## Manual `startCall` / `endCall`

When a provider has no built-in adapter, or when you need richer agent-tree context:

```ts
const callId = await audit.startCall({
  caseId: 'candidate-12345',
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet',
  modelVersion: '20241022',
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  operatorId: 'system',
  input: { resume: '…' },
});

await audit.endCall(callId, {
  outputDecision: { score: 7.5, recommended: true },
  reasonCodes: ['EXPERIENCE_MATCH', 'EDUCATION_OK'],
  humanReview: { reviewerId: 'op-1', reviewedAt: nowIso, decision: 'approve' },
  riskFlags: ['low_confidence'],
});
```

`outputDecision` wins over `output` when both are set, and `outputFingerprint` covers the same value — see [Schema + hash chain](./schema.md).

## Custom provider adapters

Implement the `ProviderAdapter` interface and register it. Custom adapters are tried before built-ins; first-detect-wins.

```ts
import { registerProvider } from '@vouchrail/sdk';

registerProvider({
  providerId: 'self_hosted',
  detect: (client) => Boolean((client as { _marker?: boolean })._marker),
  wrap: (audit, client, ctx) => {
    const original = (client as { run: (...a: unknown[]) => unknown }).run;
    (client as { run: typeof original }).run = async (...args) => {
      const id = await audit.startCall({
        caseId: ctx.caseId,
        modelProvider: 'self_hosted',
        modelName: 'mocky',
        modelVersion: 'v1',
        promptTemplateId: ctx.promptTemplateId,
        promptTemplateVersion: ctx.promptTemplateVersion,
        operatorId: ctx.operatorId,
      });
      try {
        const r = await original(...args);
        await audit.endCall(id, { output: r });
        return r;
      } catch (err) {
        await audit.endCall(id, { riskFlags: ['provider_error'] });
        throw err;
      }
    };
  },
});
```

Python uses the same shape — see `register_provider(...)` and `unregister_provider(...)` in `vouchrail`.

## Failure handling

When a wrapped call throws, the adapter still emits an `endCall` with `riskFlags: ['provider_error']` so the chain stays linear and the failure is recorded. The original exception is re-raised to the caller.

## Double-wrapping

Calling `wrap()` twice on the same client chains the adapter mutations and produces two `startCall` / `endCall` pairs per request. Don't do it. For per-call context, use `startCall` / `endCall` directly or create separate clients.
