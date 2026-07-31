// purchaseObligations.ts — SERVER ONLY. Purchase-level fulfillment obligations.
//
// The spec's rule (docs/ARTIST_LAUNCH_WIZARD.md): OFFER-level obligations are
// created when the artist publishes the offer (tierObligations.ts); PURCHASE-
// level obligations are created only when a fan actually buys something that
// requires individual fulfillment. This is the purchase half: a shipped product
// needs a shipment, a scheduled experience needs a session booked. A digital
// download delivers itself and creates NOTHING (no fake workload).
//
// Called from the Stripe webhook AFTER the purchase row lands. Best-effort and
// idempotent per purchase (webhook retries must not duplicate the task): the
// obligation carries metadata.purchase_id and is skipped when one exists.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const DUE_DAYS: Record<string, number> = { shipped: 5, scheduled: 7 };

export async function createPurchaseObligation(
  db: Db,
  args: {
    artistId: string;
    productId: string;
    purchaseId: string;
    fanId: string;
    fanName: string;
    productTitle: string;
    /** products.delivery_type: instant | shipped | scheduled. */
    deliveryType: string | null | undefined;
  },
): Promise<boolean> {
  try {
    const dueDays = args.deliveryType ? DUE_DAYS[args.deliveryType] : undefined;
    if (!dueDays) return false; // instant/unknown: nothing to fulfill by hand

    // Idempotency: one obligation per purchase, ever.
    const { data: existing } = await db
      .from('fulfillment_obligations')
      .select('id')
      .eq('artist_id', args.artistId)
      .eq('source_type', 'product')
      .eq('metadata->>purchase_id', args.purchaseId)
      .limit(1);
    if (existing?.length) return false;

    const title =
      args.deliveryType === 'shipped'
        ? `Ship "${args.productTitle}" to ${args.fanName}`
        : `Schedule "${args.productTitle}" with ${args.fanName}`;
    const due = new Date(Date.now() + dueDays * 86_400_000);
    due.setHours(12, 0, 0, 0);

    const { data: obligation } = await db
      .from('fulfillment_obligations')
      .insert({
        artist_id: args.artistId,
        source_type: 'product',
        source_product_id: args.productId,
        title,
        description: 'Created by a real purchase. Mark it complete when delivered.',
        fulfillment_type: args.deliveryType === 'shipped' ? 'shipment' : 'event',
        recurrence: 'none',
        next_due_at: null,
        audience_kind: 'all_supporters',
        requires_completion: true,
        // The artist's task, not a fan-calendar promise: the buyer already has
        // their purchase confirmation, and audience_kind cannot express one fan.
        auto_create_fan_items: false,
        auto_create_artist_task: true,
        status: 'active',
        metadata: { source: 'purchase_fulfillment', purchase_id: args.purchaseId, fan_id: args.fanId },
      })
      .select('id')
      .single();
    if (!obligation?.id) return false;

    await db.from('fulfillment_events').insert({
      obligation_id: obligation.id,
      artist_id: args.artistId,
      title,
      due_at: due.toISOString(),
      status: 'pending',
      metadata: { source: 'purchase_fulfillment', purchase_id: args.purchaseId },
    });
    return true;
  } catch (err) {
    console.error('[purchaseObligations] failed (purchase unaffected):', err);
    return false;
  }
}
