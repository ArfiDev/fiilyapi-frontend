import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrency } from "@/lib/format";
import type {
  FinancialInstrumentSummaryCard,
  FinancialInstrumentSummaryResponse,
} from "@/lib/api/hooks/useFinancialInstruments";

/**
 * E10:69-90 — DÖRT kart, mockup sırasıyla ve mockup renkleriyle:
 * Portföydeki Çek (yeşil, 70-74) · Verilen Çek (kırmızı, 75-79) ·
 * Bu Ay Vadeli (turuncu, 80-84) · İade / İptal (gri, 85-89).
 *
 * 🔴 KARTLAR ÖRTÜŞÜR VE BU TANIMDIR: portföydeki bir çek aynı anda "bu ay
 * vadeli"dir; mockup da 8 + 5 ile 3'ü ayrı sayar (E10:73, 78, 83). Toplamları
 * birbirine eşitleyen hiçbir hesap YAPILMAZ.
 *
 * 🔴 ADET `count` ALANINDAN GELİR, `items.length`ten DEĞİL: kart TÜM kümeyi
 * sayar, liste yalnız SAYFAYI döndürür (BOR-TEMIZ "iki sayaç ayrı şeydir").
 *
 * Veri gelmeden sayı UYDURULMAZ — kart iskeleti durur, değer yerine "—" basar.
 */
const DASH = "—";

interface CardSpec {
  key: keyof Omit<FinancialInstrumentSummaryResponse, "as_of">;
  label: string;
  tone: "success" | "danger" | "warning" | "muted";
  testId: string;
}

/** Sıra E10'un sırasıdır — K2 (mockup'a birebir). */
const CARDS: readonly CardSpec[] = [
  { key: "portfolio_received", label: "Portföydeki Çek", tone: "success", testId: "fin-card-portfolio" },
  { key: "issued", label: "Verilen Çek", tone: "danger", testId: "fin-card-issued" },
  { key: "due_this_month", label: "Bu Ay Vadeli", tone: "warning", testId: "fin-card-due" },
  { key: "returned_cancelled", label: "İade / İptal", tone: "muted", testId: "fin-card-returned" },
];

export function InstrumentSummaryCards({
  summary,
}: {
  summary: FinancialInstrumentSummaryResponse | undefined;
}) {
  const isHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  return (
    <div className="fin-cards" data-testid="fin-cards">
      {CARDS.map((card) => {
        const metric: FinancialInstrumentSummaryCard | undefined = summary?.[card.key];
        return (
          <div className="fin-card" key={card.key} data-testid={card.testId}>
            <div className="fin-card__label">{card.label}</div>
            <div className={`fin-card__value fin-card__value--${card.tone}`}>
              {metric ? formatCompactCurrency(metric.amount) : DASH}
              <MaskedMark isHidden={isHidden} values={[metric?.amount]} />
            </div>
            <div className="fin-card__hint">{metric ? `${metric.count} adet` : DASH}</div>
          </div>
        );
      })}
    </div>
  );
}
