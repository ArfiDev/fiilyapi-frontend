import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { BackendError, unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// BLF-F1.2 — Şirket geneli bölüm tipi listesi (`GET/POST /section-types`).
// Tipler `pnpm gen:api` çıktısından alınır (elle arayüz yok). Ad/id dışında
// alan yoktur (ölçek dönüşümü etkilemez); `DeepScale` yine de repo kuralı.
export type SectionTypeRead = DeepScale<components["schemas"]["SectionTypeRead"]>;
export type SectionTypeCreateRequest = DeepScale<components["schemas"]["SectionTypeCreate"]>;

export const SECTION_TYPES_QUERY_KEY = "section-types";

// Liste şirket geneli ve yalnız bu formdan değişir (silme/yeniden adlandırma
// ucu YOK) — uzun taze tutulur; ekleme sonrası önbellek elle güncellenir.
const SECTION_TYPES_STALE_MS = 5 * 60 * 1000;

/**
 * 409 gövdesi `SectionTypeConflict` (`{ detail, existing: {id, name} }`,
 * backend `_section_type_taken_handler`) — mevcut tip gövdeden DOĞRUDAN gelir;
 * istemci metin ayıklamaz, ad eşlemez, liste yeniden okumaz.
 */
export type SectionTypeConflict = DeepScale<components["schemas"]["SectionTypeConflict"]>;

export type CreateSectionTypeOutcome =
  | { kind: "created"; sectionType: SectionTypeRead }
  | {
      kind: "duplicate";
      /** Backend'in Türkçe mesajı aynen (yoksa yedek metin). */
      message: string;
      /** Çakışan mevcut tip (gövdeden); gövdede yoksa (beklenmez) `null`. */
      existing: SectionTypeRead | null;
    };

async function fetchSectionTypes(): Promise<SectionTypeRead[]> {
  return unwrap(await backendClient.GET("/section-types"));
}

/** `GET /section-types` — sıra sunucunundur (istemci sıralamaz). */
export function useSectionTypes(): UseQueryResult<SectionTypeRead[], Error> {
  return useQuery({
    queryKey: [SECTION_TYPES_QUERY_KEY],
    queryFn: fetchSectionTypes,
    staleTime: SECTION_TYPES_STALE_MS,
  });
}

function duplicateMessage(body: unknown): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  return typeof detail === "string" && detail.trim() ? detail : "Bu bölüm tipi zaten var.";
}

function conflictExisting(body: unknown): SectionTypeRead | null {
  const existing = (body as Partial<SectionTypeConflict> | null | undefined)?.existing;
  return existing && typeof existing.id === "string" && typeof existing.name === "string" ? existing : null;
}

/**
 * `POST /section-types`. 409 HATA OLARAK fırlatılmaz: çakışma bu akışın
 * beklenen sonucudur ("mevcut tip seçilir"), `duplicate` sonucuyla döner.
 * Diğer hatalar (403/422/5xx) `BackendError` olarak yükselir.
 */
export function useCreateSectionType(): UseMutationResult<
  CreateSectionTypeOutcome,
  Error,
  SectionTypeCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body): Promise<CreateSectionTypeOutcome> => {
      try {
        const created = unwrap(await backendClient.POST("/section-types", { body }));
        // Sunucu sırası: yeni tip son sıraya eklenir (backend sort_order = sonraki).
        queryClient.setQueryData<SectionTypeRead[]>([SECTION_TYPES_QUERY_KEY], (prev) =>
          prev === undefined || prev.some((item) => item.id === created.id) ? prev : [...prev, created],
        );
        return { kind: "created", sectionType: created };
      } catch (err) {
        if (!(err instanceof BackendError) || err.status !== 409) throw err;
        const existing = conflictExisting(err.body);
        // Başka biri tipi eklemiş olabilir: gövdedeki mevcut tip listede yoksa ekle.
        if (existing) {
          queryClient.setQueryData<SectionTypeRead[]>([SECTION_TYPES_QUERY_KEY], (prev) =>
            prev === undefined || prev.some((item) => item.id === existing.id) ? prev : [...prev, existing],
          );
        }
        return { kind: "duplicate", message: duplicateMessage(err.body), existing };
      }
    },
  });
}
