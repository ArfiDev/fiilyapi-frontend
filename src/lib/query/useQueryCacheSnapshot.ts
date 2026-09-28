"use client";

/**
 * SEKME-F1.5-FIX · paylaşılan bir Query'nin durumunu GÖZLEMCİSİZ okur.
 *
 * ─── KÖK KUSUR (ölçüldü) ──────────────────────────────────────────────────
 * react-query 5'te `useQuery` her render'da (mount VE güncelleme) çağırdığı
 * `Query#setOptions` ile paylaşılan Query nesnesinin `options`'ını TÜMÜYLE
 * DEĞİŞTİRİR — son çağıran kazanır. Aynı anahtara `queryFn: skipToken` ile
 * "yalnız oku" niyetiyle bağlanan bir gözlemci (eski `useCrumbNames`), sayfanın
 * KENDİ (gerçek queryFn'li) gözlemcisinden SONRA render olduğunda bu
 * paylaşılan `options`'ı ele geçirir. `QueryProvider`'da `retry: 1` açık
 * olduğu için sayfanın ilk denemesi başarısız olursa YENİDEN DENEME paylaşılan
 * CANLI `this.options`'ı okur — skipToken ise ağa hiç çıkmadan
 * `Error("Missing queryFn: ...")` fırlatır ve sayfa gerçek `BackendError`ı
 * (dolayısıyla 403/404 dallanmasını) hiç görmez.
 *
 * ─── ÇÖZÜM ────────────────────────────────────────────────────────────────
 * Bu kanca `setOptions` HİÇ ÇAĞIRMAZ: `QueryCache` olaylarına abone olur ve
 * `QueryClient.getQueryState` ile anlık durumu OKUR — Query'nin `options`
 * alanına dokunmadığı için paylaşan hiçbir gözlemciyi ZEHİRLEYEMEZ. Sorgu
 * hiç kurulmadıysa (önbellekte yok) `undefined` döner — bu da eski
 * `queryFn: skipToken` gözlemcisinin "veri yok" hâliyle AYNI sözleşmedir.
 *
 * ─── KARARLILIK ───────────────────────────────────────────────────────────
 * `getSnapshot` her çağrıda `client.getQueryState(queryKey)` döner; bu,
 * Query'nin kendi `state` alanının DOĞRUDAN referansıdır ve yalnız gerçek
 * bir durum geçişinde (dispatch) DEĞİŞİR — `useSyncExternalStore` bu yüzden
 * durum değişmediği sürece aynı referansı görür ve sonsuz render üretmez.
 */
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient, type QueryKey, type QueryState } from "@tanstack/react-query";

export function useQueryCacheSnapshot<TData = unknown, TError = Error>(
  queryKey: QueryKey,
): QueryState<TData, TError> | undefined {
  const client = useQueryClient();

  const subscribe = useCallback(
    (onStoreChange: () => void) => client.getQueryCache().subscribe(onStoreChange),
    [client],
  );
  const getSnapshot = () => client.getQueryState<TData, TError>(queryKey);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
