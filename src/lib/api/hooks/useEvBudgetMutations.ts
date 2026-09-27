import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { EvBudgetView, EvFillOut, EvRevisionOut } from "@/lib/api/models";
import type { DeepScale } from "@/lib/api/scale";

import {
  EV_BUDGET_DIFF_KEY,
  EV_BUDGET_KEY,
  EV_BUDGET_PREVIEW_KEY,
  EV_BUDGET_REVISIONS_KEY,
  EV_BUDGET_SCHEDULE_KEY,
} from "./useEvBudget";

// PLN-F1.6 · Adam-Saat Bütçesi YAZMA uçları. Bütün girdiler revizyona
// bağlıdır (B1-6) ve backend TASLAĞA yazar; taslak yoksa ve hiç revizyon
// yoksa ilk yazma Rev 0'ı doğurur (B1-5). Bu yüzden her yazmadan sonra
// revizyon listesi, Gantt, önizleme ve fark da tazelenir.

export type EvLeafPatch = DeepScale<components["schemas"]["LeafPatch"]>;
export type EvItemPatch = DeepScale<components["schemas"]["ItemPatch"]>;
export type EvGroupDisciplinePair = DeepScale<components["schemas"]["GroupDisciplinePair"]>;
export type EvDistributionPair = DeepScale<components["schemas"]["DistributionPair"]>;
export type EvWindowIn = DeepScale<components["schemas"]["WindowIn"]>;
export type EvFreezeBody = DeepScale<components["schemas"]["FreezeBody"]>;

const DERIVED_KEYS = [
  EV_BUDGET_REVISIONS_KEY,
  EV_BUDGET_SCHEDULE_KEY,
  EV_BUDGET_PREVIEW_KEY,
  EV_BUDGET_DIFF_KEY,
] as const;

function invalidateDerived(client: QueryClient, siteId: string) {
  for (const key of DERIVED_KEYS) void client.invalidateQueries({ queryKey: [key, siteId] });
}

/** Revizyon durumu değişen eylemler (aç/sil/dondur/doldur): her şey tazelenir. */
function invalidateAll(client: QueryClient, siteId: string) {
  void client.invalidateQueries({ queryKey: [EV_BUDGET_KEY, siteId] });
  invalidateDerived(client, siteId);
}

/**
 * `BudgetView` dönen yazmalar: yanıt varsayılan anahtara (taslak) ve taslağın
 * kendi kimlik anahtarına (`?rev=<taslak>` ile bakılıyorsa) yazılır — ikinci
 * bir GET beklenmez.
 */
function storeView(client: QueryClient, siteId: string, view: EvBudgetView) {
  client.setQueryData([EV_BUDGET_KEY, siteId, null], view);
  if (view.revision) client.setQueryData([EV_BUDGET_KEY, siteId, view.revision.id], view);
  invalidateDerived(client, siteId);
}

function useViewMutation<V>(siteId: string, request: (vars: V) => Promise<EvBudgetView>) {
  const client = useQueryClient();
  return useMutation<EvBudgetView, Error, V>({
    mutationFn: request,
    onSuccess: (view) => storeView(client, siteId, view),
  });
}

/** Oran (tekil + toplu) ve yaprak ezmeleri — gövdede GELEN alanlar yazılır. */
export function usePatchEvLeaves(siteId: string) {
  return useViewMutation<EvLeafPatch[]>(siteId, async (leaves) =>
    unwrap(
      await backendClient.PATCH("/sites/{site_id}/earned-value/budget/leaves", {
        params: { path: { site_id: siteId } },
        body: { leaves },
      }),
    ),
  );
}

/** L3 iş tipi: Kendi/Taşeron (null = disiplin varsayılanına dön) · Doğrudan/Dolaylı · katalog bağı. */
export function usePatchEvItem(siteId: string) {
  return useViewMutation<{ itemId: string; patch: EvItemPatch }>(siteId, async ({ itemId, patch }) =>
    unwrap(
      await backendClient.PATCH("/sites/{site_id}/earned-value/budget/items/{boq_item_id}", {
        params: { path: { site_id: siteId, boq_item_id: itemId } },
        body: patch,
      }),
    ),
  );
}

/** BOQ grubu → disiplin eşlemesi (K2; kısmi, `discipline_id: null` kaldırır). */
export function usePutEvGroupDisciplines(siteId: string) {
  return useViewMutation<EvGroupDisciplinePair[]>(siteId, async (items) =>
    unwrap(
      await backendClient.PUT("/sites/{site_id}/earned-value/budget/group-disciplines", {
        params: { path: { site_id: siteId } },
        body: { items },
      }),
    ),
  );
}

/** Disiplin başına dağılım tipi (B1-2). */
export function usePutEvDistributions(siteId: string) {
  return useViewMutation<EvDistributionPair[]>(siteId, async (items) =>
    unwrap(
      await backendClient.PUT("/sites/{site_id}/earned-value/budget/distributions", {
        params: { path: { site_id: siteId } },
        body: { items },
      }),
    ),
  );
}

/** Pencere ezmeleri — TAM DEĞİŞTİRME: gönderilmeyen ezme silinir (B1-3). */
export function usePutEvWindows(siteId: string) {
  return useViewMutation<EvWindowIn[]>(siteId, async (windows) =>
    unwrap(
      await backendClient.PUT("/sites/{site_id}/earned-value/budget/windows", {
        params: { path: { site_id: siteId } },
        body: { windows },
      }),
    ),
  );
}

/** "Katalogdan öner (tümü)" — yalnız BOŞ oranları doldurur (B1-4); sayıları döner. */
export function useFillEvFromCatalog(siteId: string) {
  const client = useQueryClient();
  return useMutation<EvFillOut, Error, void>({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/sites/{site_id}/earned-value/budget/fill-from-catalog", {
          params: { path: { site_id: siteId } },
        }),
      ),
    onSuccess: () => invalidateAll(client, siteId),
  });
}

/** "Taslak aç": aktif revizyon Rev N+1 taslağına kopyalanır (B1-5, F0-5 draft). */
export function useCreateEvDraft(siteId: string) {
  const client = useQueryClient();
  return useMutation<EvRevisionOut, Error, void>({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/sites/{site_id}/earned-value/budget/revisions", {
          params: { path: { site_id: siteId } },
        }),
      ),
    onSuccess: () => invalidateAll(client, siteId),
  });
}

/** Taslağı sil (approve). */
export function useDeleteEvDraft(siteId: string) {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (revisionId) => {
      unwrap(
        await backendClient.DELETE("/sites/{site_id}/earned-value/budget/revisions/{revision_id}", {
          params: { path: { site_id: siteId, revision_id: revisionId } },
        }),
      );
    },
    onSuccess: () => invalidateAll(client, siteId),
  });
}

/** Baseline dondur (approve): taslak → aktif, önceki aktif → arşiv (K8). */
export function useFreezeEvBudget(siteId: string) {
  const client = useQueryClient();
  return useMutation<EvRevisionOut, Error, EvFreezeBody>({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/sites/{site_id}/earned-value/budget/freeze", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: () => invalidateAll(client, siteId),
  });
}
