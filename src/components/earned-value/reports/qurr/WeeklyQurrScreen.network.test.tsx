import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { ReportScreenProps } from "../kit/report-screen";
import { WeeklyQurrScreen } from "./WeeklyQurrScreen";
import { QURR_FIXTURE_READY } from "./qurr-fixtures";

/**
 * FIX-F3 · UÇTAN UCA ağ ölçümü — `useWeeklyReport` GERÇEKTİR (mock'lanmadı):
 * `?hafta=` OLMADAN açılışta backend'in döndüğü haftayı S1 URL'e yazar
 * (`WeeklyQurrScreen`); bu yazım `useWeeklyReport`in queryKey'ini
 * `["current"]`den gerçek hafta numarasına değiştirir. Düzeltmeden önce bu,
 * AYNI rapor için İKİNCİ bir `GET` tetikliyordu (bkz. FIX-F3-EMIR.md). Bu
 * dosya YALNIZ `backendClient.GET`i mock'lar — gerisi (hook + ekran + S1
 * kanonikleştirmesi) gerçektir.
 */
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/api/download", () => ({
  downloadExport: vi.fn(),
  withQuery: (path: string, query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString();
    return qs ? `${path}?${qs}` : path;
  },
}));

let searchParams = new URLSearchParams();
// Gerçek Next.js'te `router.replace`, `useSearchParams()`e bağlı ağacı
// YENİDEN render eder; bu sahte router `replace` çağrısında URL'i günceller,
// testte `rerender` ile bu yeniden render'ı taklit ediyoruz (aşağıda).
const replaceMock = vi.fn((url: string) => {
  const qIndex = url.indexOf("?");
  searchParams = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : "");
});
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/planlama/haftalik-qurr",
  useSearchParams: () => searchParams,
}));

function ok(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

const LINKS: ReportScreenProps["links"] = {
  diary: (day) => `/gunluk-kayit${day ? `?tarih=${day}` : ""}`,
  budget: "/butce",
  dailyReport: (date) => `/gunluk-rapor${date ? `?tarih=${date}` : ""}`,
  weeklyReport: (week) => `/haftalik-qurr${week ? `?hafta=${week}` : ""}`,
  panel: "/panel",
};

function baseProps(): ReportScreenProps {
  return {
    siteId: "site-1",
    siteName: "A-Blok",
    companyName: "FİİL Yapı",
    projectName: "Güneşkent",
    siteCompleted: false,
    links: LINKS,
  };
}

// Prod `QueryProvider.tsx` ile AYNI `staleTime` — düzeltme (Seçenek A) bu
// değere DAYANIR (önceden doldurulan anahtar bu süre boyunca taze sayılır).
const STALE_TIME_MS = 30_000;

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: STALE_TIME_MS } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

describe("WeeklyQurrScreen — açılışta rapor ucuna TEK istek (FIX-F3)", () => {
  it("`?hafta=` OLMADAN açılış → S1 URL'i `?hafta=21`ya yazar, ama backend'e YALNIZ BİR GET gider", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ ...QURR_FIXTURE_READY, week_no: 21 }));
    const client = newClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <WeeklyQurrScreen {...baseProps()} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(searchParams.get("hafta")).toBe("21"));
    // Gerçek Next.js'in `useSearchParams` bağımlılığındaki re-render'ını taklit et.
    rerender(
      <QueryClientProvider client={client}>
        <WeeklyQurrScreen {...baseProps()} />
      </QueryClientProvider>,
    );

    // Olası (yanlış) ikinci isteğin ağa çıkmasına zaman tanı.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backendClient.GET).toHaveBeenCalledTimes(1);
  });

  it("`?hafta=5` İLE açılış → tek istek, week=5 ile gider (regresyon: elle girilen hafta bozulmadı)", async () => {
    searchParams = new URLSearchParams({ hafta: "5" });
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ ...QURR_FIXTURE_READY, week_no: 5 }));
    const client = newClient();
    render(
      <QueryClientProvider client={client}>
        <WeeklyQurrScreen {...baseProps()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(backendClient.GET).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backendClient.GET).toHaveBeenCalledTimes(1);
    expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/earned-value/reports/weekly", {
      params: { path: { site_id: "site-1" }, query: { week: 5 } },
    });
  });
});
