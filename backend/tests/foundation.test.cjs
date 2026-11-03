const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-only-jwt-secret-32-characters-long',
  ENCRYPTION_KEY: 'test-only-encryption-secret-32-characters',
  KYC_UPLOADS_ENABLED: 'true',
});
const { normalizePhMobile } = require('../dist/utils/phone');
const { encrypt, decrypt } = require('../dist/utils/crypto');
const { registerSchema } = require('../dist/modules/auth/auth.schemas');
const { errorHandler } = require('../dist/middleware/errorHandler');
const multer = require('multer');
const { prisma } = require('../dist/lib/prisma');
after(() => prisma.$disconnect());

test('Philippine phone normalization and rejection', () => {
  for (const value of ['09171234567', '+63 917 123 4567', '639171234567'])
    assert.equal(normalizePhMobile(value), '+639171234567');
  assert.equal(normalizePhMobile('123'), null);
});
test('bcrypt password limit is bytes, including Unicode', () => {
  assert.throws(() => registerSchema.parse({ mobileNumber: '09171234567', password: 'a1' + '😀'.repeat(20) }));
  assert.ok(registerSchema.parse({ mobileNumber: '09171234567', password: 'StrongPass123' }));
});
test('encryption round-trip, random nonce, authentication failure', () => {
  const a = encrypt('123456789');
  assert.equal(decrypt(a), '123456789');
  assert.notEqual(a, encrypt('123456789'));
  const parts = a.split('.');
  parts[1] = Buffer.alloc(16).toString('base64');
  assert.throws(() => decrypt(parts.join('.')));
});
test('oversized Multer upload returns 413 rather than throwing ReferenceError', () => {
  let status, body;
  const res = { status(n) { status = n; return this; }, json(v) { body = v; } };
  errorHandler(new multer.MulterError('LIMIT_FILE_SIZE'), { originalUrl: '/api/kyc/submit', method: 'POST' }, res, () => {});
  assert.equal(status, 413); assert.equal(body.error.code, 'LIMIT_FILE_SIZE');
});
test('production rejects ephemeral KYC configuration at startup', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./dist/config/env')"], {
    env: { ...process.env, NODE_ENV: 'production', KYC_STORAGE_PERSISTENT: 'false' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /persistent storage/);
});
test('production mock SMS fails closed without logging an OTP', () => {
  const result = spawnSync(process.execPath, ['-e', `
    require('./dist/services/mock/sms').sendSms('09171234567','SECRET-OTP').catch(e => {
      if(e.code !== 'SMS_NOT_CONFIGURED') process.exit(2);
    });`], { env: { ...process.env, NODE_ENV: 'production', KYC_UPLOADS_ENABLED: 'false', ALLOW_MOCK_SMS: 'false' }, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.doesNotMatch(result.stdout + result.stderr, /SECRET-OTP/);
});
test('OTP failed attempts commit, success consumes and verifies in the same transaction', async () => {
  // Unit-level transaction double. Real PostgreSQL locking is tested separately.
  const { hashOtp } = require('../dist/utils/crypto');
  const { verifyOtp } = require('../dist/services/otp');
  const original = prisma.$transaction;
  let row = { id: 'otp', attempts: 0, codeHash: hashOtp('123456'), consumedAt: null };
  let verified = false, locks = 0;
  prisma.$transaction = async fn => fn({
    $queryRaw: async () => { locks++; return [{ id: 'user' }]; },
    otpCode: {
      findFirst: async () => row.consumedAt ? null : { ...row },
      update: async ({ data }) => { row.attempts++; if(data.consumedAt) row.consumedAt = data.consumedAt; },
    },
    user: { update: async () => { verified = true; } },
  });
  try {
    await assert.rejects(verifyOtp('user', 'SIGNUP', '000000'));
    assert.equal(row.attempts, 1); assert.equal(verified, false);
    await verifyOtp('user', 'SIGNUP', '123456');
    assert.ok(row.consumedAt); assert.equal(verified, true);
    await assert.rejects(verifyOtp('user', 'SIGNUP', '123456'));
    row = { ...row, consumedAt: null, attempts: 5 }; verified = false;
    await assert.rejects(verifyOtp('user', 'SIGNUP', '123456'));
    assert.equal(row.attempts, 5); assert.equal(verified, false); assert.equal(locks, 4);
  } finally { prisma.$transaction = original; }
});
test('health, CORS denial, malformed JSON and protected routes', async () => {
  const { app } = require('../dist/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/auth/me')).status, 401);
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
