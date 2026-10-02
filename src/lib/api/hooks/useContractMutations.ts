import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { ContractDistributionSave } from "@/lib/contract-distribution-save";

import {
  CONTRACT_DISTRIBUTION_QUERY_KEY,
  EMPLOYER_CONTRACT_QUERY_KEY,
  EMPLOYER_CONTRACT_ITEMS_QUERY_KEY,
  type ContractDistributionResponse,
} from "./useContract";
import type { DeepScale } from "@/lib/api/scale";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";

// F-P5 T1 · POZ dağılımı KAYDETME (`PUT /projects/{id}/contract/distribution`).
//
// ⚠️ Gövde BİRLEŞTİRME semantiğindedir — kuralın tamamı ve saf üreticisi
// `src/lib/contract-distribution-save.ts`tedir (`buildDistributionSaveBody`).
// Bu hook gövdeyi KENDİ KURMAZ: ızgara (T4) saf üreticiyi çağırır, sonucu
// buraya geçirir. Böylece "yalnız kirli hücreler / boşaltılan `null` /
// dokunulmamış gönderilmez / `0` asla" kuralı tek yerde yaşar ve React'sız
// test edilebilir.
//
// Yanıt, kaydetme sonrası TAM dağılımdır — `setQueryData` ile önbelleğe
// yazılır (ızgara ekstra bir GET beklemeden birleştirilmiş sonucu görür),
// ayrıca türev okumalar (`items` kolonları, sözleşme metrikleri) geçersiz
// kılınır.
export function useSaveContractDistribution(
  projectId: string,
): UseMutationResult<ContractDistributionResponse, Error, ContractDistributionSave> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/projects/{project_id}/contract/distribution", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData([CONTRACT_DISTRIBUTION_QUERY_KEY, projectId], data);
      queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, projectId] });
    },
  });
}

export type EmployerContractGroupCreateRequest =
  DeepScale<components["schemas"]["EmployerContractGroupCreate"]>;
export type EmployerContractGroupResponse =
  DeepScale<components["schemas"]["EmployerContractGroupResponse"]>;

/**
 * F-POZGRUP · İşveren sözleşmesine POZ GRUBU açma
 * (`POST /projects/{project_id}/contract/groups`).
 *
 * 🔴 Bu hook olmadan yeni bir sözleşmeye İLK poz hiçbir şekilde eklenemiyordu:
 * `group_id` zorunlu, grup listesi boş, grup yaratma ucunu çağıran kod yok.
 * `useCreateBoqGroup` emsalidir (aynı iki adımlı "grup + kalem" akışı).
 *
 * Geçersiz kılma ŞART: işveren grupları AYRI bir GET ucundan gelmez, kalem
 * listesi yanıtının (`GET .../contract/items`) `groups` alanından okunur —
 * o sorgu tazelenmezse yeni grup açılırda hiç görünmez.
 */
export function useCreateEmployerContractGroup(
  projectId: string,
): UseMutationResult<EmployerContractGroupResponse, Error, EmployerContractGroupCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/contract/groups", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    // no 47 · `mutateAsync`in DÖNÜŞÜNÜ bu tazeleme SETTLE olana kadar
    // BEKLETMEK için `onSuccess` promise'i DÖNDÜRÜR (`await` ile). Aksi
    // hâlde `EmployerItemFormModal.handleSubmit` iki grubu art arda hızlı
    // açarsa ikincisi `nextSortOrder`ı hâlâ TAZELENMEMİŞ `groups` listesinden
    // hesaplar (dar ama gerçek yarış durumu).
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] }),
  });
}

export type EmployerContractItemCreateRequest =
  DeepScale<components["schemas"]["EmployerContractItemCreate"]>;
export type EmployerContractItemResponse =
  DeepScale<components["schemas"]["EmployerContractItemResponse"]>;

/**
 * F-BLG T2a · İşveren sözleşmesine elle poz ekleme
 * (`POST /projects/{project_id}/contract/items`; kanon
 * `Form - Poz Ekle Isveren.dc.html`).
 *
 * Geçersiz kılma `useSaveContractDistribution` ile AYNI üç anahtarı tazeler —
 * yeni poz hem kalem listesinde (`items`), hem dağıtım ızgarasında
 * (`distribution`, yeni satır olarak), hem de sözleşme metriklerinde
 * (`items_total`/`items_total_diff`) görünür. `setQueryData` YOKTUR: yanıt tek
 * kalemdir, listeyi temsil etmez — yarım önbellek yazmak yerine yeniden çekilir.
 */
export function useCreateEmployerContractItem(
  projectId: string,
): UseMutationResult<EmployerContractItemResponse, Error, EmployerContractItemCreateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/contract/items", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [CONTRACT_DISTRIBUTION_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, projectId] });
    },
  });
}

export type EmployerContractItemsBulkCreateRequest =
  DeepScale<components["schemas"]["EmployerContractItemsBulkCreate"]>;
export type EmployerContractItemsBulkResponse =
  DeepScale<components["schemas"]["EmployerContractItemsBulkResponse"]>;

/**
 * TKL-F2.2 · Katalogdan seçilen pozları işveren sözleşmesine TOPLU ekleme
 * (`POST /projects/{project_id}/contract/items/bulk`; hep-ya-hiç — biri hatalıysa
 * HİÇBİRİ eklenmez, bu yüzden hatada önbellek tazelenmez).
 *
 * Tekli ekleme ile AYNI üç sözleşme anahtarı + `["catalog-items"]` geçersiz kılınır:
 * toplu ekleme katalog kalemine BAĞ kurar ve eklenen kalemin fiyatı o kalemin
 * "son fiyat" kaynağı (SZL) olabilir — katalog listesindeki `last_price` değişir.
 * Söz DÖNER: mutasyon tazelenmiş önbellek gelene dek "bitmez".
 *
 * `catalog_item_id` YALNIZ bu uçta gönderilir (T28: bağ yalnız eklemede); tekli ekleme
 * ve PATCH gövdeleri onu taşımaz (PATCH'te gönderilirse backend 422 verir).
 */
export function useBulkCreateEmployerContractItems(
  projectId: string,
): UseMutationResult<
  EmployerContractItemsBulkResponse,
  Error,
  EmployerContractItemsBulkCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/contract/items/bulk", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [CONTRACT_DISTRIBUTION_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),
      ]),
  });
}

export type EmployerContractItemUpdateRequest =
  DeepScale<components["schemas"]["EmployerContractItemUpdate"]>;

export interface EmployerContractItemUpdateVars {
  itemId: string;
  body: EmployerContractItemUpdateRequest;
}

/**
 * F-ISVPOZ · İşveren sözleşmesi pozunun SATIR-İÇİ güncellenmesi
 * (`PATCH /contracts/employer/items/{item_id}`).
 *
 * ⚠️ Uç PROJE altında DEĞİLDİR (`/contracts/employer/items/…`), ama tazelenecek
 * önbellek anahtarları PROJE anahtarlıdır — bu yüzden hook `projectId` alır.
 * `useCreateEmployerContractItem` ile AYNI üç anahtar geçersiz kılınır: kalem
 * listesi, dağıtım ızgarası (miktar değişince `remaining` oynar) ve sözleşme
 * metrikleri (`items_total`/`items_total_diff` birim fiyattan türer).
 *
 * `setQueryData` YOKTUR: yanıt tek kalemdir ve `distributed_quantity` gibi
 * türev alanları taşısa da listeyi/metrikleri temsil etmez.
 *
 * 🔴 Kısıtlar (`quantity > 0`, `unit_price >= 0`) BU KATMANDA yaşamaz —
 * şemadan üretilen tip onları ifade edemez. Korkuluk çağıran taraftadır
 * (`validateQuantityField` / `validateEmployerUnitPriceField`).
 */
export function useUpdateEmployerContractItem(
  projectId: string,
): UseMutationResult<EmployerContractItemResponse, Error, EmployerContractItemUpdateVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, body }) =>
      unwrap(
        await backendClient.PATCH("/contracts/employer/items/{item_id}", {
          params: { path: { item_id: itemId } },
          body,
        }),
      ),
    // Söz DÖNER: mutasyon tazelenmiş önbellek gelene dek "bitmez". Hücre kilidi
    // (`EmployerContractItemsTable`) bu sayede sunucu değeri GÜNCELLENMEDEN
    // açılmaz — aksi hâlde bayat değerle karşılaştırma yanlış "noop" üretirdi.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [CONTRACT_DISTRIBUTION_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, projectId] }),
      ]),
  });
}
