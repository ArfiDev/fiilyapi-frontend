import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import ProjectDetailPage from "./page";
import { useCrumbNames } from "@/components/shell/breadcrumb/useCrumbNames";
import { EMPTY_KEYS } from "@/components/shell/breadcrumb/trail-node";

/**
 * SEKME-F1.5-FIX · CEO ŞARTI 1 — 403 yolu da bekçilenir.
 *
 * Bu dosya `page.test.tsx`teki gibi `useProject`/`useSites`i MOCK'LAMAZ:
 * gerçek hook'lar, gerçek `QueryClient` (uygulamadaki gibi `retry: 1`) ve
 * gerçek `backendClient` (yalnız `fetch` seviyesinde mock'lanır) üzerinden
 * koşar — çünkü sınanan şey TAM OLARAK bu üç katmanın birbirine yazdığı
 * paylaşılan Query `options`'ıdır (kod düzeyinde mock'lanmış bir hook bu
 * etkileşimi hiç GÖRMEZ).
 *
 * Sıra teşhisteki SIRAYLA aynıdır (bkz. `useCrumbNames.retry-poisoning.test.tsx`):
 * sayfa mount olur, İLK deneme 403 alır ve kendi bildirim/iyileşme döngüsü
 * OTURUR; TAM O NOKTADA — sayfa BİR DAHA render OLMADAN — yalnız kırıntının
 * sahibi (`TabsRouterSync` emsali, mağaza değişikliği gibi SORGUYLA İLGİSİZ
 * bir nedenle) BİR KEZ yeniden çizilir. Kırık kodda bu, yeniden denemenin
 * ağa hiç çıkmadan `Error("Missing queryFn: ...")` almasına yol açar —
 * sayfa gerçek `BackendError(403)`ı hiç görmez ve `isForbidden` dalı hiç
 * tetiklenmez, ekranda genel "Proje yüklenemedi" metni kalır.
 */

const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const RETRY_DELAY_MS = 40;
const SETTLE_WAIT_MS = 15;

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}`,
}));

/** `TabsRouterSync`in oynadığı rol — sayfadan bağımsız, SORGUYLA İLGİSİZ bir nedenle yeniden çizilir. */
function CrumbHolder({ bumpRef }: { bumpRef: { current: () => void } }) {
  const [, setTick] = useState(0);
  bumpRef.current = () => setTick((tick) => tick + 1);
  useCrumbNames({ ...EMPTY_KEYS, projectId: PROJECT_ID });
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ProjectDetailPage — 403 yolu (gerçek hook'lar + kırıntı yarışı)", () => {
  it("ilk deneme 403 alıp OTURDUKTAN sonra kırıntı TEK SEFER yeniden çizilince sayfa AccessDenied basar (genel hata metni DEĞİL)", async () => {
    let projectRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String((input as Request).url ?? input);
      if (url.includes(`/api/backend/projects/${PROJECT_ID}`)) {
        projectRequestCount += 1;
        return jsonResponse({ detail: "yasak" }, 403);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: RETRY_DELAY_MS } },
    });
    const bumpRef = { current: () => {} };

    render(
      <QueryClientProvider client={client}>
        <ProjectDetailPage />
        <CrumbHolder bumpRef={bumpRef} />
      </QueryClientProvider>,
    );

    // İlk denemenin bildirim/iyileşme döngüsü otursun (bkz. dosya başı yorum).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS));
    });

    // Teşhisteki sıra: SAYFA DEĞİL, yalnız kırıntı sahibi TEK SEFER yeniden çizilir.
    act(() => {
      bumpRef.current();
    });

    await waitFor(() => expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument(), {
      timeout: RETRY_DELAY_MS * 4,
    });

    // 🔴 Genel hata metni ASLA basılmamalı — kusurun canlıdaki görünümü budur.
    expect(screen.queryByText("Proje yüklenemedi")).not.toBeInTheDocument();
    // K5/B3 bekçisi: yeniden deneme AĞA ÇIKTI (2 istek) — zehirlenmiş
    // `options` ağa hiç çıkmadan senkron reddetmiyor.
    expect(projectRequestCount).toBe(2);

    vi.unstubAllGlobals();
  });
});
