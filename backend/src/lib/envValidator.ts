/**
 * Startup environment validation — fail fast on missing required vars in production.
 */

import { logger } from './logger';

interface EnvRule {
  key: string;
  required: boolean;
  /** Only required in production */
  prodOnly?: boolean;
  description: string;
}

const ENV_RULES: EnvRule[] = [
  { key: 'ENCRYPTION_KEY', required: true, prodOnly: true, description: 'AES-256 encryption key for API keys stored in DB' },
  { key: 'ADMIN_PASSWORD', required: false, prodOnly: false, description: 'Fallback admin password (recommended: use DB admin users instead)' },
];

/**
 * Validates environment variables on startup.
 * In production, missing required vars cause a fatal error.
 * In development, they produce warnings.
 */
export function validateEnvironment(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const rule of ENV_RULES) {
    const value = process.env[rule.key]?.trim();
    const missing = !value;

    if (missing && rule.required) {
      if (rule.prodOnly && !isProd) {
        warnings.push(`${rule.key} not set (${rule.description}). Required in production.`);
      } else if (rule.prodOnly && isProd) {
        errors.push(`${rule.key} is required in production (${rule.description})`);
      } else {
        errors.push(`${rule.key} is required (${rule.description})`);
      }
    }
  }

  // Warn about insecure encryption fallback
  if (!process.env.ENCRYPTION_KEY?.trim()) {
    warnings.push('ENCRYPTION_KEY not set — API keys will be stored as Base64 (not encrypted). Set ENCRYPTION_KEY for AES-256-GCM encryption.');
  }

  for (const w of warnings) {
    logger.warn('EnvValidator', w);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.error('EnvValidator', e);
    }
    if (isProd) {
      logger.error('EnvValidator', 'Fatal: missing required environment variables. Exiting.');
      process.exit(1);
    }
  }
}
