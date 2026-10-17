import assert from "node:assert/strict";
import test from "node:test";
import { currentUser, GUEST_COOKIE_NAME, HttpError } from "../app/api/_lib";
import { POST as startGuest } from "../app/api/guest/start/route";

test("production APIs require hosted identity and ignore demo identity headers", () => {
  const previous = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.throws(
      () => currentUser(new Request("https://example.test/api/boards", {
        headers: { "x-demo-user": "another-user@example.test", "x-forwarded-email": "another-user@example.test" },
      })),
      (error) => error instanceof HttpError && error.status === 401,
    );
    const first = currentUser(new Request("https://example.test/api/boards", {
      headers: { "oai-authenticated-user-email": "first@example.test" },
    }));
    const second = currentUser(new Request("https://example.test/api/boards", {
      headers: { "oai-authenticated-user-email": "second@example.test" },
    }));
    assert.notEqual(first.id, second.id);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previous);
  }
});

test("guest start creates a private, durable browser identity", async () => {
  const first = await startGuest(new Request("https://example.test/api/guest/start", { method: "POST" }));
  const second = await startGuest(new Request("https://example.test/api/guest/start", { method: "POST" }));
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("location"), "/");
  const firstCookie = first.headers.get("set-cookie")!;
  const secondCookie = second.headers.get("set-cookie")!;
  assert.match(firstCookie, /HttpOnly; SameSite=Lax; Secure/);
  const firstToken = firstCookie.match(new RegExp(`${GUEST_COOKIE_NAME}=([A-Za-z0-9_-]{43})`))?.[1];
  const secondToken = secondCookie.match(new RegExp(`${GUEST_COOKIE_NAME}=([A-Za-z0-9_-]{43})`))?.[1];
  assert.ok(firstToken);
  assert.ok(secondToken);
  const forCookie = (token: string) => new Request("https://example.test/api/boards", {
    headers: { cookie: `${GUEST_COOKIE_NAME}=${token}` },
  });
  const firstUser = currentUser(forCookie(firstToken));
  assert.equal(firstUser.kind, "guest");
  assert.equal(firstUser.id, currentUser(forCookie(firstToken)).id);
  assert.notEqual(firstUser.id, currentUser(forCookie(secondToken)).id);
  assert.notEqual(firstUser.id, currentUser(new Request("https://example.test/api/boards", {
    headers: { "oai-authenticated-user-email": firstUser.email },
  })).id);
  assert.equal(currentUser(new Request("https://example.test/api/boards", {
    headers: { cookie: `${GUEST_COOKIE_NAME}=${firstToken}`, "oai-authenticated-user-email": "owner@example.test" },
  })).kind, "account");
});
