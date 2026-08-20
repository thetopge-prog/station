import { listPastryBatches, listOffers, listTodayItemOffers, type PastryBatch, type Offer, type ItemOffer } from "@/lib/cafe/pastry-actions";
import { getPublicMenu } from "@/lib/cafe/menu-data";
import { isDemoServer } from "@/lib/cafe/demo";
import { PastriesClient } from "@/components/cafe/PastriesClient";

export const dynamic = "force-dynamic";

export default async function PastriesPage() {
  let batches: PastryBatch[] = [];
  let offers: Offer[] = [];
  let itemOffers: ItemOffer[] = [];
  let pastryItems: { id: string; name_ar: string; price: number }[] = [];
  try {
    if (!isDemoServer()) {
      const [b, o, io, menu] = await Promise.all([listPastryBatches(), listOffers(), listTodayItemOffers(), getPublicMenu()]);
      batches = b;
      offers = o;
      itemOffers = io;
      pastryItems = (menu.find((c) => c.name_ar.includes("معجنات"))?.items ?? []).map((i) => ({ id: i.id, name_ar: i.name_ar, price: i.price }));
    }
  } catch {
    // signed-out / demo — empty state
  }
  return <PastriesClient batches={batches} offers={offers} itemOffers={itemOffers} pastryItems={pastryItems} />;
}
