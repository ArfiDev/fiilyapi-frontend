import { cx } from "@/lib/cx";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";
import type { Percent } from "@/lib/api/scale";
import type { ProgressPaymentListItem } from "@/lib/api/hooks/useProgressPayments";

import { computeProgressPaymentsTotals } from "./totals";
import "./progress-payments-totals.css";

/**
 * Proje bağlamı bilinen ekranlardan (T6 şantiye sekmesi) gelen özet verisi
 * (coordinator review round 2). `useProgressPaymentSummary`nin
 * `payment_count`/`progress_pct` alanlarından türetilir — proje bağlamı
 * olmayan ekranlarda (T2 `/hakedisler`, tek proje yok → özet çağrılamaz)
 * bu prop HİÇ verilmez.
 */
export interface ProgressPaymentsTotalsSummary {
  paymentCount: number;
  /** null gelebilir (sözleşme bedeli eksik) — o zaman yüzde BASILMAZ. */
  progressPct: Percent | null;
}

export interface ProgressPaymentsTotalsStripProps {
  /** Liste verisi henüz gelmediyse (yükleniyor/hata) şerit HİÇ basılmaz —
   * gerçek kartların değeri `items`den türetildiğinden bilinmeyen bir sayıyı
   * "0" gibi göstermemek için. */
  items?: ProgressPaymentListItem[];
  /** Verilmezse (T2) alt metinde yalnız `items.length` sayısı basılır, yüzde
   * hiç basılmaz. Verilse bile özet sorgusu başarısızsa çağıran taraf bu
   * prop'u `undefined` geçer — sayfa KIRILMAZ, alt metin yüzdesiz kalır
   * (`ProgressPaymentDetailView`deki "özet hata verirse KPI basılmaz"
   * deseninin aynısı). */
  summary?: ProgressPaymentsTotalsSummary;
  /**
   * F-TH T5 — şantiye sekmesi (`SiteProgressPaymentsView`) taşeron KPI'larını
   * doldurmak için verir. T2'nin proje-genel `/hakedisler` listesinde şantiye
   * bağlamı (dolayısıyla taşeron toplamı) YOK — bu prop orada HİÇ verilmez,
   * o zaman iki kart eskisi gibi `pendingModule` gösterir (davranış
   * DEĞİŞMEDİ, mevcut testler bozulmaz).
   */
  subcontractor?: ProgressPaymentsTotalsSubcontractor;
}

export interface ProgressPaymentsTotalsSubcontractor {
  /** N+1 istekler (hakediş listesi + sözleşme detayları) sürüyor. */
  isLoading: boolean;
  /** Sözleşme detaylarının bir kısmı/tamamı hata verdi — toplam VE marj
   * GÜVENİLMEZ, ikisi de pending gösterilir (brief §Kısmi hata). */
  isPartial: boolean;
  /** Şantiyeye süzülmüş taşeron hakedişlerinin brüt toplamı. */
  grossTotal: string;
  /** Mockup satır 84 alt metni "12 taşeron". */
  distinctSubcontractorCount: number;
  /** "Onay Bekleyen" KPI'ına eklenecek taşeron payı. */
  pendingApprovalCount: number;
  /** `computeGrossMargin` çıktısı — `null` ise marj BASILMAZ (pending). */
  marginPct: Percent | null;
}

interface RealCard {
  label: string;
  value: string;
  subtitle?: string;
  /** Varsayılan `pp-kpi-subtitle` — "Toplam İşveren Hakedişi" ile "Toplam
   * Taşeron Ödemesi" AYNI ANDA alt metin taşıdığından (F-TH T5) testlerin
   * `getByTestId` ile TEKİL employer alt metnini bulabilmesi için taşeron
   * kartı KENDİ testid'ini taşır. */
  subtitleTestId?: string;
  /** Mockup satır 83/86: taşeron toplamı kırmızı, kâr marjı yeşil basılır. */
  tone?: "danger" | "success";
  pendingModule?: undefined;
  isLoadingCard?: undefined;
}
interface PendingCard {
  label: string;
  value?: undefined;
  subtitle?: undefined;
  subtitleTestId?: undefined;
  tone?: undefined;
  pendingModule: string;
  /** Varsayılan `pendingModuleLabel(pendingModule)` yerine gösterilecek
   * metin — F-TH T5 kısmi hata durumunda "gelecek modül" metni yerine
   * "bazı sözleşme detayları yüklenemedi" gibi duruma özel bir ipucu için. */
  pendingTitle?: string;
  isLoadingCard?: undefined;
}
interface LoadingKpiCard {
  label: string;
  value?: undefined;
  subtitle?: undefined;
  subtitleTestId?: undefined;
  tone?: undefined;
  pendingModule?: undefined;
  isLoadingCard: true;
}
type TotalsCard = RealCard | PendingCard | LoadingKpiCard;

// Mockup satır 82: "Toplam İşveren Hakedişi" kartının alt metni "4 hakediş ·
// %75" — sayı HER ZAMAN basılır (T2'de items.length, T6'da backend'in
// payment_count'u tercih edilir — brief: "backend'in doğrusu"). Yüzde yalnız
// `summary` verilmişse VE `progressPct` null değilse eklenir.
function paymentsSubtitle(itemCount: number, summary?: ProgressPaymentsTotalsSummary): string {
  const count = summary ? summary.paymentCount : itemCount;
  const parts = [`${count} hakediş`];
  if (summary && summary.progressPct !== null) {
    parts.push(formatPercent(summary.progressPct));
  }
  return parts.join(" · ");
}

// KPI şeridi (mockup `Şantiye - Hakedişler.dc.html` satır 81-86, T2'nin
// `/hakedisler` genel listesinde de AYNI mockup — coordinator review T6 fix):
// dört karttan ikisi mevcut liste verisinden türetilebilir, ikisi taşeron
// hakediş modülüne bağlıdır (henüz yok). Şerit TAMAMEN atlanmaz — karma
// basılır. `value` ve `pendingModule` AYNI karta AYNI ANDA verilmez (tip
// düzeyinde ayrık union ile zorlanır) — brief'in "available=true ile
// pending_module aynı anda verilmez" kuralının bu ekrandaki karşılığı.
function taseronTotalCard(subcontractor?: ProgressPaymentsTotalsSubcontractor): TotalsCard {
  const label = "Toplam Taşeron Ödemesi";
  if (!subcontractor) return { label, pendingModule: "subcontracts" };
  if (subcontractor.isLoading) return { label, isLoadingCard: true };
  if (subcontractor.isPartial) {
    return {
      label,
      pendingModule: "subcontracts",
      pendingTitle: "Bazı taşeron sözleşmeleri yüklenemedi — toplam eksik olabilir",
    };
  }
  return {
    label,
    value: formatCompactCurrency(subcontractor.grossTotal),
    subtitle: `${subcontractor.distinctSubcontractorCount} taşeron`,
    subtitleTestId: "pp-kpi-subcontractor-subtitle",
    tone: "danger",
  };
}

function grossMarginCard(subcontractor?: ProgressPaymentsTotalsSubcontractor): TotalsCard {
  const label = "Brüt Kar Marjı";
  if (!subcontractor) return { label, pendingModule: "subcontracts" };
  if (subcontractor.isLoading) return { label, isLoadingCard: true };
  if (subcontractor.isPartial || subcontractor.marginPct === null) {
    return {
      label,
      pendingModule: "subcontracts",
      pendingTitle: subcontractor.isPartial
        ? "Bazı taşeron sözleşmeleri yüklenemedi — kâr marjı eksik olabilir"
        : pendingModuleLabel("subcontracts"),
    };
  }
  return { label, value: formatPercent(subcontractor.marginPct), tone: "success" };
}

function cardsFrom(
  items: ProgressPaymentListItem[],
  summary?: ProgressPaymentsTotalsSummary,
  subcontractor?: ProgressPaymentsTotalsSubcontractor,
): TotalsCard[] {
  const { grossTotal, pendingApprovalCount } = computeProgressPaymentsTotals(items);
  // "Onay Bekleyen" iki tarafın toplamıdır (mockup satır 84: "3" = 1 işveren
  // + 2 taşeron) — ama taşeron sayısı yalnız GÜVENİLİR olduğunda (yükleniyor/
  // kısmi hata DEĞİLKEN) eklenir; aksi halde eksik ama SAHTE-OLMAYAN bir alt
  // sınır (yalnız işveren sayısı) gösterilir (brief §Kısmi hata).
  const combinedPendingApproval =
    subcontractor && !subcontractor.isLoading && !subcontractor.isPartial
      ? pendingApprovalCount + subcontractor.pendingApprovalCount
      : pendingApprovalCount;
  return [
    {
      label: "Toplam İşveren Hakedişi",
      value: formatCompactCurrency(grossTotal),
      subtitle: paymentsSubtitle(items.length, summary),
    },
    taseronTotalCard(subcontractor),
    { label: "Onay Bekleyen", value: String(combinedPendingApproval) },
    grossMarginCard(subcontractor),
  ];
}

export function ProgressPaymentsTotalsStrip({
  items,
  summary,
  subcontractor,
}: ProgressPaymentsTotalsStripProps) {
  if (!items) return null;

  return (
    <div className="ppt" data-testid="pp-totals-strip">
      {cardsFrom(items, summary, subcontractor).map((card) => (
        <div key={card.label} className="ppt__card">
          <div className="ppt__label">{card.label}</div>
          {card.isLoadingCard ? (
            <div className="ppt__value ppt__value--loading" data-testid="pp-kpi-loading">
              Yükleniyor…
            </div>
          ) : card.pendingModule ? (
            <div
              className="ppt__value ppt__value--pending"
              data-testid="pp-kpi-pending"
              title={card.pendingTitle ?? pendingModuleLabel(card.pendingModule)}
            >
              —<span className="sr-only">{card.pendingTitle ?? pendingModuleLabel(card.pendingModule)}</span>
            </div>
          ) : (
            <>
              <div
                className={cx("ppt__value", card.tone && `ppt__value--${card.tone}`)}
                data-testid="pp-kpi-value"
              >
                {card.value}
              </div>
              {card.subtitle && (
                <div className="ppt__subtitle" data-testid={card.subtitleTestId ?? "pp-kpi-subtitle"}>
                  {card.subtitle}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
