import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleDb } from "./create-db";
import { customers } from "./schema/customers";
import { flowExecutions } from "./schema/flow-executions";
import { orders } from "./schema/orders";
import { reviews } from "./schema/reviews";
import { shops } from "./schema/shops";

/** PRD §19 — GDPR / DPDP erasure for a single customer. */
export async function eraseCustomer(
  db: DrizzleDb,
  args: { shopDomain: string; shopifyCustomerId: string },
): Promise<{ deleted: number }> {
  const [shop] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.shopifyDomain, args.shopDomain))
    .limit(1);
  if (!shop) return { deleted: 0 };

  const matched = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.shopId, shop.id),
        eq(customers.shopifyCustomerId, args.shopifyCustomerId),
      ),
    );

  const ids = matched.map((c) => c.id);
  if (ids.length === 0) return { deleted: 0 };

  await db
    .delete(flowExecutions)
    .where(inArray(flowExecutions.customerId, ids));
  await db.delete(reviews).where(inArray(reviews.customerId, ids));
  await db
    .update(orders)
    .set({ customerId: null, shippingAddress: null })
    .where(inArray(orders.customerId, ids));
  await db.delete(customers).where(inArray(customers.id, ids));

  return { deleted: ids.length };
}

/** PRD §19 — full shop wipe (called from `shop/redact` 48h after uninstall). */
export async function eraseShop(
  db: DrizzleDb,
  shopDomain: string,
): Promise<{ ok: boolean }> {
  await db.delete(shops).where(eq(shops.shopifyDomain, shopDomain));
  return { ok: true };
}
