import type { Session } from "@shopify/shopify-api";
import type { DrizzleDb } from "@retainiq/db";
import { shops } from "@retainiq/db/schema";
import { seedDefaultFlowsForShop } from "@retainiq/db";

export async function upsertShopFromSession(
  db: DrizzleDb,
  session: Session,
): Promise<void> {
  if (!session.accessToken) {
    throw new Error("OAuth session missing access token");
  }

  const [row] = await db
    .insert(shops)
    .values({
      shopifyDomain: session.shop,
      accessToken: session.accessToken,
      planTier: "starter",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [shops.shopifyDomain],
      set: {
        accessToken: session.accessToken,
        isActive: true,
      },
    })
    .returning();

  if (row) await seedDefaultFlowsForShop(db, row.id);
}
