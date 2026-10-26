import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";

export interface QuestEntry {
  id: string; title: string; act: string; sha256: string; next: string | null;
  category: string; location: string; hint: string; surface: string;
  brief?: string;
  oracle?: Record<string, unknown>;
}
export interface Quest {
  entries: QuestEntry[];
  homeFiles: Record<string, string>;
  webFiles: Record<string, string>;
  injections: Record<string, string[]>;
  headers: Record<string, Record<string, string>>;
}

export function loadQuest(key: string, filename = path.join(import.meta.dir, "..", "data", "quest.enc.json")): Quest | null {
  if (!key) return null;
  try {
    const sealed = JSON.parse(fs.readFileSync(filename, "utf8"));
    const bytes = Buffer.from(key, "base64url");
    if (bytes.length !== 32 || sealed.version !== 1) throw new Error("Invalid key or format");
    const decipher = crypto.createDecipheriv("aes-256-gcm", bytes, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    const clear = Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]);
    const quest = JSON.parse(gunzipSync(clear).toString("utf8")) as Quest;
    if (!Array.isArray(quest.entries) || !quest.homeFiles || !quest.headers || !quest.webFiles || !quest.injections) throw new Error("Invalid quest content");
    return quest;
  } catch {
    throw new Error("Quest could not be opened. Check QUEST_MASTER_KEY in the private environment.");
  }
}
