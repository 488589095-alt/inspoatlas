import assert from "node:assert/strict";
import test from "node:test";
import { currentUser, HttpError } from "../app/api/_lib";

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
