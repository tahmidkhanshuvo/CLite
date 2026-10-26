import { expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { loadQuest } from "../lib/quest";

test("quest content requires the correct authenticated decryption key", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "clite-sealed-"));
  try {
    const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
    const fixture = { entries: [], homeFiles: {}, webFiles: {}, injections: {}, headers: {} };
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(fixture)))), cipher.final()]);
    const filename = path.join(folder, "fixture.json");
    await fs.writeFile(filename, JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") }));
    expect(loadQuest(key.toString("base64url"), filename)).toEqual(fixture);
    expect(() => loadQuest(crypto.randomBytes(32).toString("base64url"), filename)).toThrow();
    expect(loadQuest("", filename)).toBeNull();
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
