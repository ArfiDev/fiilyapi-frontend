import { useState } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { PROJECT_QUERY_KEY } from "@/lib/api/hooks/useProjects";
import { BackendError } from "@/lib/api/unwrap";
import { EMPTY_KEYS } from "./trail-node";
import { useCrumbNames } from "./useCrumbNames";

/**
 * SEKME-F1.5-FIX · KÖK KUSURUN BİREBİR YENİDEN ÜRETİMİ (ölçüldü, gerçek
 * zamanlayıcılarla).
 *
 * Sıra teşhisteki SIRAYLA aynıdır: sayfanın KENDİ gözlemcisi (gerçek
 * queryFn, `QueryProvider`'daki gibi `retry: 1`) mount olur, İLK deneme
 * başarısız olur ve kendi bildirim/iyileşme döngüsü OTURUR (sayfa yeniden
 * render olup paylaşılan Query'nin `options`'ını kendi gerçek queryFn'iyle
 * tazeler). TAM O NOKTADA — sayfa BİR DAHA render OLMADAN — yalnız
 * `useCrumbNames` SAHİBİ (TabsRouterSync emsali, mağaza değişikliği gibi
 * SORGUYLA İLGİSİZ bir nedenle) BİR KEZ yeniden çizilir. Eski
 * `useQuery({ queryFn: skipToken })` mekanizmasında bu tek yeniden çizim
 * paylaşılan `options`'ı skipToken'a çevirir ve BİR DAHA kimse tazelemez;
 * `retry: 1` devredeyken YENİDEN DENEME bu CANLI `options`'ı okur, ağa hiç
 * çıkmadan `Error("Missing queryFn: ...")` fırlatır — sayfanın gerçek
 * `BackendError`ı (404/403 dallanması) hiç gelmez ve `queryFn` YALNIZ BİR
 * kez çağrılmış kalır (ölçüldü: `src/lib/query/_scratch-repro.test.tsx`
 * taslağıyla doğrulandı, o dosya teslim edilmez).
 */

const PROJECT_ID = "p-poison-1234";
const QUERY_KEY = [PROJECT_QUERY_KEY, PROJECT_ID];
const RETRY_DELAY_MS = 40;
const SETTLE_WAIT_MS = 15;

/** Sayfanın kendi gözlemcisi — gerçek queryFn, uygulamadaki `retry: 1` ile. */
function PageObserver({ queryFn }: { queryFn: () => Promise<unknown> }) {
  useQuery({ queryKey: QUERY_KEY, queryFn, retry: 1, retryDelay: RETRY_DELAY_MS });
  return null;
}

/**
 * `TabsRouterSync`in oynadığı rol: mağaza değiştikçe SAYFADAN BAĞIMSIZ,
 * SORGUYLA İLGİSİZ bir nedenle yeniden çizilir. `bumpRef` teste yalnız BU
 * bileşeni yeniden çizdirme imkanı verir — sayfa (`PageObserver`) kendi
 * state'i değişmediği için bu bump'tan ETKİLENMEZ.
 */
function CrumbHolder({ bumpRef }: { bumpRef: { current: () => void } }) {
  const [, setTick] = useState(0);
  bumpRef.current = () => setTick((tick) => tick + 1);
  useCrumbNames({ ...EMPTY_KEYS, projectId: PROJECT_ID });
  return null;
}

describe("useCrumbNames — retry zehirlenmesi (SEKME-F1.5-FIX)", () => {
  it("kırıntı sahibi (SAYFA DEĞİL) sayfanın ilk denemesi OTURDUKTAN sonra yeniden çizilince yeniden deneme GERÇEK queryFn'i tekrar çağırır", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: RETRY_DELAY_MS } },
    });
    const queryFn = vi.fn(async () => {
      throw new BackendError(404, { detail: "proje bulunamadı" });
    });
    const bumpRef = { current: () => {} };

    render(
      <QueryClientProvider client={client}>
        <PageObserver queryFn={queryFn} />
        <CrumbHolder bumpRef={bumpRef} />
      </QueryClientProvider>,
    );

    // İlk denemenin bildirim/iyileşme döngüsü otursun (teşhisteki sıranın
    // ÖN KOŞULU): bump bundan ÖNCE gelirse sayfanın kendi tazelemesi kusuru
    // maskeler, ölçüm bunu ELEDİ (bkz. dosya başı yorum).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS));
    });

    // Teşhisteki sıra: SAYFA DEĞİL, yalnız kırıntı sahibi TEK SEFER yeniden
    // çizilir — sonra bir daha KİMSE render olmaz (retry kendiliğinden gelir).
    act(() => {
      bumpRef.current();
    });

    // 🔴 Bugünkü (kırık) kodla bu asla 2'ye ulaşmaz: zehirlenmiş `options`
    // yeniden denemede ağa hiç çıkmaz, `queryFn` yalnız BİR kez çağrılmış
    // kalır — `waitFor` burada zaman aşımıyla KIRMIZI düşer.
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2), {
      timeout: RETRY_DELAY_MS * 4,
    });

    const finalState = client.getQueryState(QUERY_KEY);
    // 🔴 Son hata `Error("Missing queryFn: ...")` DEĞİL, sayfanın gerçek
    // `BackendError`ıdır — 403/404 dallanması bu ayrımın üstüne kuruludur.
    expect(finalState?.error).toBeInstanceOf(BackendError);
    expect((finalState?.error as BackendError).status).toBe(404);
  });
});
