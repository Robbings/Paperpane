import test from "node:test";
import assert from "node:assert/strict";
import { MarkdownUploadTasks } from "../src/domain/notes/upload-tasks.ts";
const gate = () => {
  let release;
  const promise = new Promise((r) => (release = r));
  return { promise, release };
};

test("later upload success cannot clear an earlier failure or its retry", async () => {
  const q = new MarkdownUploadTasks();
  let fail = true,
    aInserted = 0,
    bInserted = 0;
  const a = q.create(
    "notes",
    async () => {
      if (fail) throw Error("first image failed");
      aInserted++;
    },
    () => {},
  );
  await assert.rejects(a.retry());
  const b = q.create(
    "notes",
    async () => {
      bInserted++;
    },
    () => {},
  );
  await b.retry();
  assert.equal(q.firstFailure("notes"), a);
  assert(q.unsaved);
  assert(!(await q.settle()));
  assert.equal(aInserted, 0);
  assert.equal(bInserted, 1);
  fail = false;
  await a.retry();
  assert.equal(aInserted, 1);
  assert(!q.unsaved);
  assert(await q.settle());
});
test("two failures stay separate across failed retry, cancel, and success", async () => {
  const q = new MarkdownUploadTasks();
  let aFail = true,
    bFail = true,
    aCalls = 0,
    bCalls = 0;
  const a = q.create(
      "same",
      async () => {
        aCalls++;
        if (aFail) throw Error("A");
      },
      () => {},
    ),
    b = q.create(
      "same",
      async () => {
        bCalls++;
        if (bFail) throw Error("B");
      },
      () => {},
    );
  await Promise.allSettled([a.retry(), b.retry()]);
  await assert.rejects(a.retry());
  assert(q.has(a.id) && q.has(b.id));
  a.cancel();
  assert(!q.has(a.id));
  assert.equal(q.firstFailure("same"), b);
  bFail = false;
  await b.retry();
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 2);
  assert(!q.unsaved);
});
test("repeated retry clicks reuse one in-flight attempt", async () => {
  const q = new MarkdownUploadTasks(),
    g = gate();
  let calls = 0;
  const a = q.create(
    "notes",
    async () => {
      calls++;
      await g.promise;
    },
    () => {},
  );
  const first = a.retry(),
    second = a.retry();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  g.release();
  await first;
  assert(!q.unsaved);
});
test("cancel one owner cancels its pending insertion but leaves another owner intact", async () => {
  const q = new MarkdownUploadTasks(),
    g = gate();
  let inserted = 0;
  const a = q.create(
      "comment-A",
      async (cancelled) => {
        await g.promise;
        if (!cancelled()) inserted++;
      },
      () => {},
    ),
    b = q.create(
      "notes-B",
      async () => {
        throw Error("B");
      },
      () => {},
    );
  const running = a.retry();
  await assert.rejects(b.retry());
  q.cancelOwner("comment-A");
  g.release();
  await running;
  assert.equal(inserted, 0);
  assert(!q.has(a.id));
  assert.equal(q.firstFailure("notes-B"), b);
  b.cancel();
  assert(!q.unsaved);
});
test("failed upload survives editor unmount and releases resources only after retry completes", async () => {
  const q = new MarkdownUploadTasks();
  let live = true,
    released = 0,
    fail = true;
  let a;
  const release = () => {
    if (!live && !q.has(a.id)) released++;
  };
  a = q.create(
    "comment",
    async () => {
      if (fail) throw Error("file write failed");
    },
    release,
  );
  await assert.rejects(a.retry());
  live = false;
  release();
  assert.equal(released, 0);
  fail = false;
  await a.retry();
  assert.equal(released, 1);
});
test("settle also waits for tasks started while an earlier upload is pending", async () => {
  const q = new MarkdownUploadTasks(),
    g = gate(),
    h = gate();
  const a = q.create(
    "notes",
    async () => {
      await g.promise;
    },
    () => {},
  );
  const ap = a.retry();
  let settled = false;
  const leaving = q.settle().then((value) => {
    settled = true;
    return value;
  });
  const b = q.create(
    "notes",
    async () => {
      await h.promise;
    },
    () => {},
  );
  const bp = b.retry();
  g.release();
  await ap;
  assert(!settled);
  h.release();
  await bp;
  assert(await leaving);
});

test("document transition blocks new uploads but drains accepted ones", async () => {
  const q = new MarkdownUploadTasks(),
    g = gate();
  let inserted = 0;
  const accepted = q.create(
    "notes",
    async () => {
      await g.promise;
      inserted++;
    },
    () => {},
  );
  const upload = accepted.retry(),
    release = q.holdNewUploads();
  assert(q.blocked);
  assert.throws(
    () =>
      q.create(
        "notes",
        async () => {},
        () => {},
      ),
    /切换论文/,
  );
  const settled = q.settle();
  g.release();
  await upload;
  assert(await settled);
  assert.equal(inserted, 1);
  release();
  assert(!q.blocked);
  const next = q.create(
    "notes",
    async () => {
      inserted++;
    },
    () => {},
  );
  await next.retry();
  assert.equal(inserted, 2);
});

test("nested transition barriers release independently and idempotently", () => {
  const q = new MarkdownUploadTasks(),
    a = q.holdNewUploads(),
    b = q.holdNewUploads();
  a();
  a();
  assert(q.blocked);
  b();
  assert(!q.blocked);
});

test("transition barrier does not discard a failed accepted upload or prevent retry", async () => {
  const q = new MarkdownUploadTasks();
  let fail = true;
  const a = q.create(
    "notes",
    async () => {
      if (fail) throw Error("failed");
    },
    () => {},
  );
  await assert.rejects(a.retry());
  const release = q.holdNewUploads();
  assert(!(await q.settle()));
  assert.equal(q.firstFailure("notes"), a);
  fail = false;
  await a.retry();
  assert(await q.settle());
  release();
});
