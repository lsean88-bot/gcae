"use server";

import { revalidatePath } from "next/cache";
import { MAX_UPLOAD_BYTES } from "@/lib/analytics-io";
import { actorNow } from "@/server/authz";
import { getRunAs, inspectUploadAs, linkRunAs, runAnalyticsAs, type RunParams, type UploadFile } from "@/server/analytics";

async function fileFrom(fd: FormData, key: string, sheetKey: string): Promise<UploadFile | null | { error: string }> {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) return { error: "File is larger than 20 MB." };
  const sheet = String(fd.get(sheetKey) || "") || null;
  return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), sheet };
}

export async function inspectUploadAction(fd: FormData) {
  const who = await actorNow();
  const file = await fileFrom(fd, "file", "sheet");
  if (!file) return { ok: false as const, error: "Choose a file." };
  if ("error" in file) return { ok: false as const, error: file.error };
  return inspectUploadAs(who, file);
}

export async function runAnalyticsAction(fd: FormData) {
  const who = await actorNow();
  const a = await fileFrom(fd, "fileA", "sheetA");
  if (!a) return { ok: false as const, error: "Choose a file." };
  if ("error" in a) return { ok: false as const, error: a.error };
  const b = await fileFrom(fd, "fileB", "sheetB");
  if (b && "error" in b) return { ok: false as const, error: b.error };
  const params = JSON.parse(String(fd.get("params") || "{}")) as RunParams;
  const res = await runAnalyticsAs(who, { engagementId: String(fd.get("engagementId") || "") || null, test: String(fd.get("test") || ""), fileA: a, fileB: b, params });
  if (res.ok) revalidatePath("/analytics");
  return res;
}

export async function linkRunAction(runId: string, engagementId: string) {
  const res = await linkRunAs(await actorNow(), runId, engagementId);
  if (res.ok) revalidatePath("/analytics");
  return res;
}

export async function loadRunAction(runId: string) {
  return getRunAs(await actorNow(), runId);
}
