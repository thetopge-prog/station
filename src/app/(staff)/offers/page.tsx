import { listOffers, listTodayItemOffers, type Offer, type ItemOffer } from "@/lib/cafe/offer-actions";
import { getPublicMenu } from "@/lib/cafe/menu-data";
import { isDemoServer } from "@/lib/cafe/demo";
import { OffersClient } from "@/components/cafe/OffersClient";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  let offers: Offer[] = [];
  let itemOffers: ItemOffer[] = [];
  let items: { id: string; name_ar: string; price: number; category: string }[] = [];
  try {
    if (!isDemoServer()) {
      const [o, io, menu] = await Promise.all([listOffers(), listTodayItemOffers(), getPublicMenu()]);
      offers = o;
      itemOffers = io;
      // THE WHOLE MENU. This used to filter to a category whose name contained
      // «معجنات» — a cafe assumption. Station has no such category, so the
      // picker was always empty and a working feature looked broken.
      items = menu.flatMap((c) => c.items.map((i) => ({ id: i.id, name_ar: i.name_ar, price: i.price, category: c.name_ar })));
    }
  } catch {
    // signed-out / demo — empty state
  }
  return <OffersClient offers={offers} itemOffers={itemOffers} items={items} />;
}
