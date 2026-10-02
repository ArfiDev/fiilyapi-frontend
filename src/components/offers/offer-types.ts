import type { OfferListItem, OfferListResponse, OfferRevisionStatus } from "@/lib/api/hooks/useOffers";

/**
 * TKL-F3.4 · liste ekranının tip adları — TEK tanım `lib/api/hooks/useOffers.ts`tedir (F3.2);
 * bu dosya yalnız bileşenlerin eski adlarını oradan yeniden ihraç eder (K-F3-4).
 */
export type { OfferListItem, OfferListResponse };
export type OfferStatus = OfferRevisionStatus;
export type OfferListSummary = OfferListResponse["summary"];
export type OfferStatusSummary = OfferListSummary["by_status"][number];
