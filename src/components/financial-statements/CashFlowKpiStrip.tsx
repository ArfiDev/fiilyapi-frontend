import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import type { CashFlowStatementResponse } from "@/lib/api/hooks/useCashFlowStatement";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";

import type { CashFlowTone } from "./cash-flow-statement";
import {
  cashFlowDirection,
  formatSignedAmount,
  sectionKpiLabel,
  sectionTone,
} from "./cash-flow-statement";

interface CashFlowKpiStripProps {
  data: CashFlowStatementResponse;
}

/**
 * NA:43-60 — DÖRT kartlık özet şeridi (`repeat(4,1fr)`, 14px boşluk). İlk üçü
 * `sections[]`ten (A/B/C) gelir, dördüncüsü NET değişimdir.
 *
 * 🔴 **K2 — MOCKUP KENDİ İÇİNDE ÇELİŞİYOR ve TABLO KAZANIYOR.** NA:58 dördüncü
 * kartta `+ 4.802.000` yazıyor; ama aynı mockup'ın tablosu (NA:105)
 * `NET NAKİT DEĞİŞİMİ (A+B+C) = + 3.802.000` diyor. ÖLÇÜM:
 * `5.842.000 − 1.240.000 − 800.000 = 3.802.000` ve tablo kendi içinde
 * tutarlıdır (`2.447.500 + 3.802.000 = 6.249.500`, NA:101/105/109) ⇒ KPI kartı
 * 1.000.000 FAZLA. Repo kanonu K15: mockup'ın alt bandı SATIRLARIYLA
 * çelişiyorsa SATIRLAR kazanır.
 *
 * ⇒ Bu kart SUNUCUNUN `net_change`ini basar; kendi toplamını HESAPLAMAZ. Tablo
 * ile bu kart AYNI sayıyı basar ve bunu adı konmuş bir test kilitler
 * (`CashFlowStatementView.test.tsx` · "K2"). Mockup DÜZELTİLMEZ (kullanıcı
 * kararı: "mockup'taki sayılar örnektir, onlara takılma").
 */
export function CashFlowKpiStrip({ data }: CashFlowKpiStripProps) {
  return (
    <div className="fs-cf-kpis" data-testid="na-kpis">
      {/* NA:44-55 — A/B/C bölümleri. Ton bölümün KENDİ `code`undan türer. */}
      {data.sections.map((section) => (
        <KpiCard
          key={section.key}
          label={sectionKpiLabel(section)}
          amount={section.subtotal}
          tone={sectionTone(section.code)}
          testId={`na-kpi-${section.key}`}
        />
      ))}

      {/* NA:56-59 — NET kart: zeminli, sunucunun `net_change`i (K2). */}
      <KpiCard
        // NA:57 — sunucuda karşılığı olmayan SABİT bir başlıktır (kapanış
        // satırlarının etiketleri gibi); mockup'tan alınır.
        label="Net Nakit Artışı"
        // Net kartın kod harfi YOKTUR ⇒ NÖTR ton; rengini tutarın YÖNÜNDEN alır.
        amount={data.net_change}
        tone="neutral"
        highlighted
        testId="na-kpi-net"
      />
    </div>
  );
}

function KpiCard({
  label,
  amount,
  tone,
  highlighted = false,
  testId,
}: {
  label: string;
  amount: string | null;
  tone: CashFlowTone;
  highlighted?: boolean;
  testId: string;
}) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  // NÖTR ton (net kart) rengini tutarın YÖNÜNDEN alır: net artış yeşil, net
  // azalış kırmızı. NA:58 pozitif dalı çizer; negatif dal mockup'ta YOKTUR
  // ama gerçek bir sonuçtur ve yeşil basılamaz.
  const resolved: CashFlowTone =
    tone === "neutral" ? (cashFlowDirection(amount) === "out" ? "out" : "in") : tone;

  return (
    <article
      className={`fs-cf-kpi fs-cf-kpi--${resolved}${highlighted ? " fs-cf-kpi--highlight" : ""}`}
      data-testid={testId}
    >
      {/* NA:45 — 11px, BÜYÜK HARF, harf aralıklı. */}
      <h2 className="fs-cf-kpi__label">{label}</h2>
      {/* NA:46 — 20/700 MONO, işaretli. */}
      <p className="fs-cf-kpi__value">
        {formatSignedAmount(amount)}
        <MaskedMark isHidden={isHidden} values={[amount]} />
      </p>
    </article>
  );
}
