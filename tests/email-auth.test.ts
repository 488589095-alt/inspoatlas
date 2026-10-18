import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { accountIdForEmail, hashLoginCode, makeSessionCookie, normalizedEmail, readEmailSession } from "../app/api/_email-auth";
import { currentUser, HttpError } from "../app/api/_lib";

const oldSecret = process.env.AUTH_SESSION_SECRET;
const oldVercel = process.env.VERCEL;
before(() => { process.env.AUTH_SESSION_SECRET = "unit-test-secret-with-at-least-32-characters"; process.env.VERCEL = "1"; });
after(() => {
  if (oldSecret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = oldSecret;
  if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
});

test("verified email keeps the existing Sites owner ID", () => {
  assert.equal(normalizedEmail("  Example@Example.COM  "), "example@example.com");
  assert.equal(accountIdForEmail("example@example.com"), "31c5543c1734d25c7206f5fd");
});

test("Vercel session is signed, expires, and ignores forged Sites headers", () => {
  const now = 1_800_000_000_000;
  const cookie = makeSessionCookie("example@example.com", now).split(";")[0];
  assert.equal(readEmailSession(cookie, now + 1000), "example@example.com");
  assert.equal(readEmailSession(cookie, now + 31 * 24 * 60 * 60 * 1000), null);
  assert.equal(readEmailSession(cookie.replace(/.$/, "x"), now + 1000), null);
  const forged = new Request("https://inspoatlas.online/api/session", { headers: { "oai-authenticated-user-email": "victim@example.com" } });
  assert.throws(() => currentUser(forged), (error) => error instanceof HttpError && error.status === 401);
  const signed = new Request("https://inspoatlas.online/api/session", { headers: { cookie, "oai-authenticated-user-email": "victim@example.com" } });
  assert.equal(currentUser(signed).email, "example@example.com");
});

test("verification codes are bound to one challenge", () => {
  assert.notEqual(hashLoginCode("one", "123456"), hashLoginCode("two", "123456"));
});
