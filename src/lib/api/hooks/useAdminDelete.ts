import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";
import { invalidateAccountingScope } from "./accounting-invalidate";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";
import { FINANCIAL_INSTRUMENTS_QUERY_KEY, FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY } from "./useFinancialInstruments";
import { INVOICE_DETAIL_QUERY_KEY, INVOICE_PAYMENTS_QUERY_KEY } from "./useInvoiceDetail";
import { INVOICES_QUERY_KEY, INVOICE_SUMMARY_QUERY_KEY } from "./useInvoices";
import { LAND_SHARE_UNITS_QUERY_KEY } from "./useLandShare";
import { PROJECT_BLOCKS_QUERY_KEY } from "./useProjectBlocks";
import { PROJECT_UNITS_QUERY_KEY } from "./useProjectUnits";
import {
  PROGRESS_PAYMENTS_QUERY_KEY,
  PROGRESS_PAYMENT_QUERY_KEY,
  PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
} from "./useProgressPayments";
import { PROJECTS_QUERY_KEY, PROJECT_QUERY_KEY } from "./useProjects";
import { SECTION_QUERY_KEY } from "./useSection";
import { SITE_SECTIONS_QUERY_KEY } from "./useSiteSections";
import { SITES_QUERY_KEY, SITE_QUERY_KEY } from "./useSites";
import {
  SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
} from "./useSubcontractorProgressPayments";

export type DeleteKind = components["schemas"]["DeleteKind"];
export type DeletePreview = DeepScale<components["schemas"]["DeletePreviewResponse"]>;
export type DeletePreviewGroup = DeepScale<components["schemas"]["DeletePreviewGroup"]>;

export const DELETE_PREVIEW_QUERY_KEY = "delete-preview";

/**
 * SIL-F1.2 · `GET /admin/silme/{kind}/{id}/onizleme`.
 *
 * Önizleme token'ı DELETE'e AYNEN verilir; bu yüzden önbellekte TUTULMAZ
 * (`gcTime: 0`, `staleTime: 0`) ve pencere her açılışta taze ağaç çeker.
 * `retry: false`: 403/404 yeniden denemekle düzelmez.
 */
export function useDeletePreview(
  kind: DeleteKind,
  id: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseQueryResult<DeletePreview, Error> {
  return useQuery({
    enabled: enabled && id.length > 0,
    queryKey: [DELETE_PREVIEW_QUERY_KEY, kind, id],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DeletePreview> =>
      unwrap(
        await backendClient.GET("/admin/silme/{kind}/{record_id}/onizleme", {
          params: { path: { kind, record_id: id } },
        }),
      ),
  });
}

export interface AdminDeleteVars {
  kind: DeleteKind;
  id: string;
  previewToken: string;
}

/**
 * Silinen kayıt ağacı birden çok sorgu ailesinde yaşar (şantiye → bölüm →
 * blok → ünite). Ağaç türüne göre dar liste tutmak bayat kalmaya açıktır;
 * hepsi işaretlenir. `refetchType: "none"`: silinen kaydın KENDİ detay sorgusu
 * ekranda hâlâ etkindir ve yeniden çekilirse 404 hata ekranı yanıp söner —
 * çağıran listeye yönlendirir, hedef ekran açılışta bayat sorguyu çeker.
 */
const INVALIDATED_QUERY_KEYS = [
  SITES_QUERY_KEY,
  SITE_QUERY_KEY,
  SITE_SECTIONS_QUERY_KEY,
  SECTION_QUERY_KEY,
  PROJECTS_QUERY_KEY,
  PROJECT_QUERY_KEY,
  PROJECT_BLOCKS_QUERY_KEY,
  PROJECT_UNITS_QUERY_KEY,
  LAND_SHARE_UNITS_QUERY_KEY,
] as const;

/**
 * SIL-F2.2 · mali aileler. `active`: ekranda AÇIK liste/özet sorguları (silince
 * yeniden çekilir — silme penceresi çoğu zaman listenin KENDİSİNDEN açılır).
 * `passive`: silinen kaydın KENDİ detay sorguları (yeniden çekilirse 404
 * yanıp söner; yukarıdaki `refetchType: "none"` gerekçesi). Muhasebe kapsamı
 * (fiş/defter/mizan/KDV) her mali silmede ayrıca tazelenir: silme fişleri de
 * götürür.
 */
interface FinancialInvalidation {
  active: readonly string[];
  passive: readonly string[];
}

/**
 * Anahtarlar ÇAĞRI ANINDA okunur (import anında DEĞİL): bu dosya her silme
 * penceresiyle birlikte yüklenir; bir ekran testi bu ailelerden birini
 * kısmen taklit ederse import anında patlamasın diye.
 */
function financialInvalidation(kind: DeleteKind): FinancialInvalidation | undefined {
  switch (kind) {
    case "progress_payment":
      return {
        active: [PROGRESS_PAYMENTS_QUERY_KEY, PROGRESS_PAYMENT_SUMMARY_QUERY_KEY, CATALOG_ITEMS_QUERY_KEY],
        passive: [PROGRESS_PAYMENT_QUERY_KEY],
      };
    case "subcontractor_progress_payment":
      return {
        active: [SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY, SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY],
        passive: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY],
      };
    case "invoice":
      return {
        active: [INVOICES_QUERY_KEY, INVOICE_SUMMARY_QUERY_KEY],
        passive: [INVOICE_DETAIL_QUERY_KEY, INVOICE_PAYMENTS_QUERY_KEY],
      };
    case "payment":
      // Ödeme silmek faturanın durumunu yeniden türetir: detay AÇIK ve silinmedi.
      return {
        active: [INVOICE_PAYMENTS_QUERY_KEY, INVOICE_DETAIL_QUERY_KEY, INVOICES_QUERY_KEY, INVOICE_SUMMARY_QUERY_KEY],
        passive: [],
      };
    case "journal_entry":
      return { active: [], passive: [] };
    case "financial_instrument":
      return {
        active: [FINANCIAL_INSTRUMENTS_QUERY_KEY, FINANCIAL_INSTRUMENT_SUMMARY_QUERY_KEY],
        passive: [],
      };
    default:
      return undefined;
  }
}

/**
 * SIL-F1.2 · `DELETE /admin/silme/{kind}/{id}?preview_token=`.
 * Hata sınıflandırması `classifyDeleteError`tadır (`@/lib/api/delete-error`).
 */
export function useAdminDelete(): UseMutationResult<void, Error, AdminDeleteVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, previewToken }) => {
      unwrap(
        await backendClient.DELETE("/admin/silme/{kind}/{record_id}", {
          params: {
            path: { kind, record_id: id },
            query: { preview_token: previewToken },
          },
        }),
      );
    },
    onSuccess: (_data, { kind }) => {
      for (const key of INVALIDATED_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key], refetchType: "none" });
      }
      const financial = financialInvalidation(kind);
      if (financial === undefined) return;
      for (const key of financial.passive) {
        queryClient.invalidateQueries({ queryKey: [key], refetchType: "none" });
      }
      for (const key of financial.active) queryClient.invalidateQueries({ queryKey: [key] });
      invalidateAccountingScope(queryClient);
    },
  });
}
