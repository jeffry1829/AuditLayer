import { createHmac } from 'node:crypto';

import type { SigningKeyConfig } from './config.js';
import { SIGNING_DEFAULTS } from './defaults.js';
import { VouchRailConfigError, VouchRailSignerError, ERROR_CODES } from './errors.js';

export interface Signer {
  /** Returns a signature string for the given SHA-256 hex digest. */
  sign(entryHashHex: string): Promise<string>;
  /** Identifier of the key used; recorded in the signature metadata if needed. */
  readonly keyId: string;
}

let inlineSignerWarned = false;

export class InlineSigner implements Signer {
  readonly keyId = SIGNING_DEFAULTS.inlineKeyId;
  constructor(private readonly secret: string) {
    if (!secret || secret.length < SIGNING_DEFAULTS.inlineSecretMinLength) {
      throw new VouchRailSignerError(
        ERROR_CODES.SIGNER_INVALID_SECRET,
        `InlineSigner: secret must be at least ${SIGNING_DEFAULTS.inlineSecretMinLength} characters. ` +
          'Inline signing is intended for development only; use a KMS signer in production.',
        { minLength: SIGNING_DEFAULTS.inlineSecretMinLength },
      );
    }
    // Warn once per process so dev / test loops stay quiet.
    if (!inlineSignerWarned && process.env['VOUCHRAIL_SUPPRESS_INLINE_WARNING'] !== '1') {
      inlineSignerWarned = true;
      process.emitWarning(
        'InlineSigner is intended for development only. Use a KMS-backed signer in production.',
        { code: 'VOUCHRAIL_INLINE_SIGNER' },
      );
    }
  }

  async sign(entryHashHex: string): Promise<string> {
    const mac = createHmac('sha256', this.secret).update(entryHashHex, 'utf8').digest('hex');
    return `${SIGNING_DEFAULTS.inlineSignaturePrefix}:${this.keyId}:${mac}`;
  }
}

class ExternalSigner implements Signer {
  constructor(
    readonly keyId: string,
    private readonly signFn: (entryHashHex: string) => Promise<string> | string,
  ) {}

  async sign(entryHashHex: string): Promise<string> {
    const out = await this.signFn(entryHashHex);
    if (typeof out !== 'string' || out.length === 0) {
      throw new VouchRailSignerError(
        ERROR_CODES.SIGNER_EXTERNAL_INVALID_OUTPUT,
        'External signer returned an invalid signature',
        { keyId: this.keyId },
      );
    }
    return out;
  }
}

export function createSigner(config: SigningKeyConfig): Signer {
  switch (config.kind) {
    case 'inline':
      return new InlineSigner(config.secret);
    case 'kms':
      return new ExternalSigner(config.keyId, config.sign);
    default: {
      const _exhaustive: never = config;
      void _exhaustive;
      throw new VouchRailConfigError(
        ERROR_CODES.CONFIG_INVALID,
        'createSigner: unknown signing key kind',
        { received: config },
      );
    }
  }
}
