// Requires an explicitly supplied disposable PostgreSQL database; creates and deletes only its own test user.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a migrated disposable database');
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL,
 JWT_SECRET: 'test-only-jwt-secret-32-characters-long', ENCRYPTION_KEY: 'test-only-encryption-secret-32-characters', KYC_UPLOADS_ENABLED: 'false' });
const { prisma } = require('../dist/lib/prisma');
const { issueOtp, verifyOtp } = require('../dist/services/otp');
after(() => prisma.$disconnect());
test('PostgreSQL: concurrent issue, consumption, failed attempts and expiration', async () => {
  const user = await prisma.user.create({ data: { mobileNumber: 'test-' + require('node:crypto').randomUUID(), passwordHash: 'not-a-login-hash' } });
  try {
    const sends = await Promise.allSettled(Array.from({length: 8}, () => issueOtp(user, 'SIGNUP')));
    assert.equal(sends.filter(x => x.status === 'fulfilled').length, 1);
    const code = sends.find(x => x.status === 'fulfilled').value;
    const checks = await Promise.allSettled(Array.from({length: 8}, () => verifyOtp(user.id, 'SIGNUP', code)));
    assert.equal(checks.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await prisma.user.findUniqueOrThrow({where: {id: user.id}})).isMobileVerified, true);
    await prisma.otpCode.updateMany({where: {userId: user.id}, data: {consumedAt: null, attempts: 0}});
    const wrong = code === '000000' ? '000001' : '000000';
    await Promise.allSettled(Array.from({length: 12}, () => verifyOtp(user.id, 'SIGNUP', wrong)));
    assert.equal((await prisma.otpCode.findFirstOrThrow({where: {userId: user.id}})).attempts, 5);
    await assert.rejects(verifyOtp(user.id, 'SIGNUP', code));
    await prisma.otpCode.updateMany({where: {userId: user.id}, data: {attempts: 0, expiresAt: new Date(0)}});
    await assert.rejects(verifyOtp(user.id, 'SIGNUP', code));
  } finally { await prisma.user.delete({where: {id: user.id}}); }
});
