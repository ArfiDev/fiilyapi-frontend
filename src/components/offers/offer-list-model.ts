import { EMPTY_CELL, formatDecimal } from "@/lib/format";
import { sumDecimalStrings } from "@/lib/decimal";
import { buildListTruncation } from "@/lib/list-truncation";

import { OFFER_CARD_STATUSES } from "./offer-status";
import type { OfferListItem, OfferListSummary, OfferStatus } from "./offer-types";

const FRACTION_DIGITS = 2;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const TR_INTEGER = new Intl.NumberFormat("tr-TR");

/**
 * Liste hücresi tutarı: "₺48.750.000,00" (mockup TL:240-243 — HER ZAMAN iki kuruş hanesi).
 * Kayıpsız: tam kısım BigInt ile biçimlenir, `Number()` YOK. Maskeli (`null`) → "—".
 */
export function formatLiraFixed(value: string | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_CELL;
  if (!DECIMAL_PATTERN.test(value)) return value;
  const [whole = "0", fraction = ""] = value.split(".");
  const cents = fraction.padEnd(FRACTION_DIGITS, "0").slice(0, FRACTION_DIGITS);
  return `₺${TR_INTEGER.format(BigInt(whole))},${cents}`;
}

export type ListedTotals =
  | { kind: "truncated" }
  | { kind: "sum"; net: string | null; gross: string | null };

/**
 * "Listelenen toplam" (TL:175-182). Liste kırpılmışsa (`total > items`) Σ BASILMAZ — eksik
 * listenin toplamı gerçek gibi görünürdü (`lib/list-truncation.ts` kanonu). Maskeli bir satır
 * varsa toplam BİLİNMEZ (`null` → "—").
 */
export function listedTotals(items: readonly OfferListItem[], total: number): ListedTotals {
  if (buildListTruncation(items.length, total).isTruncated) return { kind: "truncated" };
  return {
    kind: "sum",
    net: sumDecimalStrings(items.map((item) => item.net)),
    gross: sumDecimalStrings(items.map((item) => item.gross)),
  };
}

export interface StatusCardModel {
  status: OfferStatus;
  count: number;
  /** Kartta tutar basılır mı (mockup: yalnız Gönderildi + Kazanıldı). */
  showsAmount: boolean;
  /** `null` = maskeli. */
  net: string | null;
  sub: string;
  foot: string;
}

const AMOUNT_STATUSES: ReadonlySet<OfferStatus> = new Set(["sent", "won"]);
const CARD_SUB: Readonly<Partial<Record<OfferStatus, string>>> = {
  draft: "hazırlanıyor",
  sent: "yanıt bekleniyor",
};

/**
 * Dört durum kartı `summary.by_status`'tan (TL:92-100). Alt metinler yalnız sunucunun özet
 * verisi VARSA basılır: "Son: …" için veri yok → basılmaz; "2026" alt etiketi basılmaz (ÜS-F3-4).
 */
export function buildStatusCards(summary: OfferListSummary): StatusCardModel[] {
  const countOf = (status: OfferStatus) => summary.by_status.find((row) => row.status === status)?.count ?? 0;
  return OFFER_CARD_STATUSES.map((status) => {
    const row = summary.by_status.find((entry) => entry.status === status);
    return {
      status,
      count: row?.count ?? 0,
      showsAmount: AMOUNT_STATUSES.has(status),
      net: row?.net ?? null,
      sub: CARD_SUB[status] ?? "",
      foot: cardFoot(status, summary, countOf("won") + countOf("lost")),
    };
  });
}

function cardFoot(status: OfferStatus, summary: OfferListSummary, decided: number): string {
  if (status === "draft") return "Gönderilmeyi bekliyor";
  if (status === "sent") {
    return summary.expired_count > 0 ? `${summary.expired_count} teklifin geçerliliği doldu` : "";
  }
  if (status === "won" && summary.win_rate !== null) {
    return `Kazanma oranı %${formatDecimal(summary.win_rate, 1)} · karara bağlanan ${decided} tekliften`;
  }
  return "";
}

export interface RowMenuRules {
  newRevision: { enabled: boolean; reason: string | null };
  /** "Taslağı sil" yalnız tek revizyonlu (rev 0) taslakta MENÜDE görünür (T31/ÜS-F3-12). */
  canDelete: boolean;
}

export const NO_WRITE_REASON = "Teklifleri yalnız Sözleşmeler tam yetkisi değiştirir";
const NEW_REVISION_REASONS: Readonly<Partial<Record<OfferStatus, string>>> = {
  draft: "Taslak revizyon düzenlenebilir; yeni revizyon gönderilen ya da kaybedilen teklife açılır",
  won: "Kazanılan teklife revizyon açılmaz",
  withdrawn: "Vazgeçilen teklife revizyon açılmaz",
};

/** ⋯ menüsünün kuralları (TKL-F3 §1.3, §4.2). Yeni revizyon yalnız son revizyon `sent|lost` iken. */
export function rowMenuRules(item: Pick<OfferListItem, "status" | "rev_no">, canWrite: boolean): RowMenuRules {
  const statusReason = NEW_REVISION_REASONS[item.status] ?? null;
  const reason = !canWrite ? NO_WRITE_REASON : statusReason;
  return {
    newRevision: { enabled: reason === null, reason },
    canDelete: canWrite && item.status === "draft" && item.rev_no === 0,
  };
}
