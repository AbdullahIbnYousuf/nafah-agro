// @vitest-environment node

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseTokenVerifier } from './supabaseAuth.js';

const supabaseUrl = 'https://project.supabase.co';
const issuer = `${supabaseUrl}/auth/v1`;
let sign: (input?: { issuer?: string; audience?: string; subject?: string; expires?: string }) => Promise<string>;
let verify: ReturnType<typeof createSupabaseTokenVerifier>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  const keyResolver = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'ES256', use: 'sig' }] });
  verify = createSupabaseTokenVerifier(supabaseUrl, 'authenticated', keyResolver);
  sign = (input = {}) => new SignJWT({ email: 'owner@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? 'authenticated')
    .setSubject(input.subject ?? '4cd56ef4-56d8-4a22-92fe-887e6f601de6')
    .setIssuedAt()
    .setExpirationTime(input.expires ?? '1h')
    .sign(privateKey);
});

describe('Supabase access-token verification', () => {
  it('accepts the expected issuer, audience, expiry, and subject', async () => {
    const result = await verify(await sign());
    expect(result).toMatchObject({
      id: '4cd56ef4-56d8-4a22-92fe-887e6f601de6',
      email: 'owner@example.com',
    });
  });

  it.each([
    ['issuer', { issuer: 'https://attacker.example/auth/v1' }],
    ['audience', { audience: 'anon' }],
    ['expiry', { expires: '0s' }],
  ])('rejects an invalid %s', async (_label, input) => {
    await expect(verify(await sign(input))).rejects.toThrow();
  });

  it('rejects a token without a subject', async () => {
    const token = await sign({ subject: '' });
    await expect(verify(token)).rejects.toThrow('does not contain a subject');
  });
});
