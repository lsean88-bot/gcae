"use server";

import { revalidatePath } from "next/cache";
import * as core from "@/server/strategic-core";
import { actorNow } from "@/server/authz";

type Rest<F> = F extends (who: core.Who, ...rest: infer R) => unknown ? R : never;

export async function assessResidual(...a: Rest<typeof core.assessResidual>) {
  const result = await core.assessResidual(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function createPlan(...a: Rest<typeof core.createPlan>) {
  const result = await core.createPlan(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function addPlanItem(...a: Rest<typeof core.addPlanItem>) {
  const result = await core.addPlanItem(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function updatePlanItem(...a: Rest<typeof core.updatePlanItem>) {
  const result = await core.updatePlanItem(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function removePlanItem(...a: Rest<typeof core.removePlanItem>) {
  const result = await core.removePlanItem(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function updatePlanSettings(...a: Rest<typeof core.updatePlanSettings>) {
  const result = await core.updatePlanSettings(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function approvePlan(...a: Rest<typeof core.approvePlan>) {
  const result = await core.approvePlan(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function recordAcNoted(...a: Rest<typeof core.recordAcNoted>) {
  const result = await core.recordAcNoted(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function updateItemProgress(...a: Rest<typeof core.updateItemProgress>) {
  const result = await core.updateItemProgress(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function generatePack(...a: Rest<typeof core.generatePack>) {
  const result = await core.generatePack(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

export async function releasePack(...a: Rest<typeof core.releasePack>) {
  const result = await core.releasePack(await actorNow(), ...a);
  revalidatePath("/", "layout");
  return result;
}

