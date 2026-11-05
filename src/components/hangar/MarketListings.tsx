import { MOCK_MARKET_LISTINGS } from "@/game/data/market";
import { MarketItemCard } from "@/components/hangar/MarketItemCard";

export function MarketListings() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {MOCK_MARKET_LISTINGS.map(({ id, item, estado }) => (
        <MarketItemCard key={id} item={item} status={estado} />
      ))}
    </div>
  );
}
