import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "./persistence.js";
import path from "node:path";
import os from "node:os";
import { mkdir } from "node:fs/promises";

describe("HMAC Audit Chain", () => {
  it("computes HMAC chain signatures and verifies integrity", async () => {
    const tmpDir = path.join(os.tmpdir(), "hmac-test-" + Date.now());
    await mkdir(tmpDir, { recursive: true });
    const file = path.join(tmpDir, "events.jsonl");
    const store = new JsonlEventStore(file);

    process.env.OMNIBRANCH_AUDIT_SECRET = "secret123";

    await store.append({
      streamId: "run:1",
      expectedStreamVersion: 0,
      events: [
        {
          eventId: "evt-1" as any,
          schemaVersion: 1,
          correlationId: "corr-1",
          streamId: "run:1",
          type: "campaign.created",
          occurredAt: new Date().toISOString(),
          payload: { campaignId: "c-1" },
        },
      ],
    });

    const verifyResult = await store.verifyHmacChain("secret123");
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.errors).toHaveLength(0);

    delete process.env.OMNIBRANCH_AUDIT_SECRET;
  });
});
