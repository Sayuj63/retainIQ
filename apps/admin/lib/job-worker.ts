import {
  dispatchStep,
  getBootstrappedDb,
  planPostPurchaseFlow,
  processDueJobs,
} from "@retainiq/db";
import { getStubProviders } from "./providers";

let interval: ReturnType<typeof setInterval> | undefined;

export async function startJobWorker(): Promise<void> {
  const db = await getBootstrappedDb();
  const providers = getStubProviders();

  const handlers = {
    "post-purchase": async (payload: Record<string, unknown>) => {
      const shopId = String(payload.shopId ?? "");
      const orderId = String(payload.orderId ?? "");
      if (!shopId || !orderId) return;
      await planPostPurchaseFlow(db, { shopId, orderId });
    },
    "dispatch-step": async (payload: Record<string, unknown>) => {
      await dispatchStep(db, providers, payload);
    },
    "replenishment-reminder": async (payload: Record<string, unknown>) => {
      const sku = String(payload.sku ?? "?");
      const title = String(payload.title ?? sku);
      const customerId = String(payload.customerId ?? "");
      const shopId = String(payload.shopId ?? "");
      await providers.whatsapp({
        to: customerId,
        body: `Time to restock your ${title}? Tap to reorder: https://app.example/reorder?c=${customerId}&sku=${sku}`,
        template: "replenishment_reminder",
        shopDomain: shopId,
      });
    },
    "review-recovery-alert": async (payload: Record<string, unknown>) => {
      process.stdout.write(
        `${JSON.stringify({ kind: "review-recovery-alert", ...payload, at: new Date().toISOString() })}\n`,
      );
    },
    "nps-detractor-followup": async (payload: Record<string, unknown>) => {
      process.stdout.write(
        `${JSON.stringify({ kind: "nps-detractor-followup", ...payload, at: new Date().toISOString() })}\n`,
      );
    },
    "nps-promoter-referral": async (payload: Record<string, unknown>) => {
      const customerId = String(payload.customerId ?? "");
      await providers.whatsapp({
        to: customerId,
        body: `You're a fan! Share your referral link and earn rewards: https://app.example/refer?c=${customerId}`,
        template: "promoter_referral_invite",
        shopDomain: String(payload.shopId ?? ""),
      });
    },
  };

  const tick = async () => {
    try {
      await processDueJobs(db, handlers, { limit: 50 });
    } catch (err) {
      console.error("[job-worker]", err);
    }
  };

  await tick();
  interval = setInterval(tick, 2000);
}

export function stopJobWorkerForTests(): void {
  if (interval) clearInterval(interval);
  interval = undefined;
}
