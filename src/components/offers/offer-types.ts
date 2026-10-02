import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * TKL-F3.3 · liste ekranının tip kaynağı — üretilen şemadan (TKL-F3.1 devri).
 * F3.2 `models.ts` takma adlarını yazınca bu dosya oradan yeniden ihraç eder (tek tanım).
 */
export type OfferStatus = components["schemas"]["OfferRevisionStatus"];
export type OfferListItem = DeepScale<components["schemas"]["OfferListItem"]>;
export type OfferListResponse = DeepScale<components["schemas"]["OfferListResponse"]>;
export type OfferListSummary = DeepScale<components["schemas"]["OfferListSummaryRead"]>;
export type OfferStatusSummary = DeepScale<components["schemas"]["OfferStatusSummaryRead"]>;

/** Liste süzgeci (sunucuda uygulanır). `null` = süzgeç yok. */
export interface OfferFilter {
  status: OfferStatus | null;
  employerId: string | null;
  /** Debounce EDİLMİŞ arama metni (ağa giden değer). */
  q: string;
}
