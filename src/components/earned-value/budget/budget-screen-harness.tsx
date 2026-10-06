import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { backendClient } from "@/lib/api/client";
import { useSession } from "@/components/shell/SessionProvider";
import type {
  EvBudgetView,
  EvFillOut,
  EvPreviewOut,
  EvRevisionDiffOut,
  EvRevisionOut,
  EvScheduleOut,
  EvSuggestionsOut,
} from "@/lib/api/models";

import { evMe } from "../ev-session.testkit";
import { ACTIVE_REV_1, D_KAB, budgetView, diffOut, previewOut, revision, scheduleOut } from "./budget-fixtures";

/**
 * `vi.mock` ile sahtelenmiş bir fonksiyonun bu yardımcının kullandığı yüzeyi.
 * 🔴 Bu dosya test-DIŞI adlıdır; `vitest` İMPORT EDEMEZ (bekçi:
 * `src/lib/api/` altındaki stub bekçisi). `vi.mocked` zaten yalnız bir
 * TİP dökümüdür — çalışma zamanında sahte fonksiyonun kendi metodu çağrılır.
 */
interface MockSurface {
  mockImplementation(impl: unknown): unknown;
  mockReturnValue(value: unknown): unknown;
  mock: { calls: unknown[][] };
}
const asMock = (fn: unknown): MockSurface => fn as MockSurface;

// PLN-F1.6 · Ekran testlerinin ORTAK düzeneği (yalnız testler ithal eder):
// gerçek react-query hook'ları + sahte `backendClient` (yol başına yanıt),
// oturum izni ve gövde yakalama. Çağıran test dosyası `vi.mock`ları KENDİSİ
// kurar (vitest hoisting'i modül başına çalışır).

export interface BackendState {
  view: EvBudgetView;
  revisions: EvRevisionOut[];
  diff: EvRevisionDiffOut;
  schedule: EvScheduleOut;
  preview: EvPreviewOut;
  suggestions: EvSuggestionsOut;
  fill: EvFillOut;
  budgetStatus: number;
  /** Bütçe GET'i hiç çözülmesin (yükleniyor hâli). */
  budgetPending: boolean;
  /** Şirket disiplin listesi (`GET /earned-value/disciplines`). */
  disciplines: unknown[];
}

export function defaultState(): BackendState {
  return {
    view: budgetView(),
    revisions: [revision(), ACTIVE_REV_1],
    diff: diffOut(),
    schedule: scheduleOut(),
    preview: previewOut(),
    suggestions: {
      catalog: [{ catalog_item_id: "c-1", discipline_id: "d", match: "exact", name: "Beton döküm", standard_unit_mhr: "1.8", uom: "m³" }],
      history: [],
    },
    fill: { filled_leaf_count: 3, filled_item_count: 2, ambiguous_count: 1, unmatched_count: 0, ambiguous: [] },
    budgetStatus: 200,
    budgetPending: false,
    disciplines: [
      { id: D_KAB, code: "KAB", name: "Kaba İnşaat", color: "#2563eb", default_contractor_type: "own", sort_order: 1 },
      { id: "d-pey", code: "PEY", name: "Peyzaj", color: "#16a34a", default_contractor_type: "subcon", sort_order: 2 },
    ],
  };
}

function ok(data: unknown, status = 200) {
  return Promise.resolve({ data, error: undefined, response: new Response(null, { status: status === 204 ? 204 : 200 }) } as never);
}

function fail(status: number) {
  return Promise.resolve({ data: undefined, error: { detail: "hata" }, response: new Response(null, { status }) } as never);
}

export function wireBackend(state: BackendState) {
  asMock(backendClient.GET).mockImplementation(((path: string) => {
    if (path.endsWith("/budget")) {
      if (state.budgetPending) return new Promise(() => undefined);
      return state.budgetStatus === 200 ? ok(state.view) : fail(state.budgetStatus);
    }
    if (path.endsWith("/revisions")) return ok(state.revisions);
    if (path.endsWith("/diff")) return ok(state.diff);
    if (path.endsWith("/schedule")) return ok(state.schedule);
    if (path.endsWith("/suggestions")) return ok(state.suggestions);
    if (path === "/earned-value/disciplines") return ok(state.disciplines);
    return fail(404);
  }) as never);
  asMock(backendClient.POST).mockImplementation(((path: string) => {
    if (path.endsWith("/preview")) return ok(state.preview);
    if (path.endsWith("/fill-from-catalog")) return ok(state.fill);
    if (path.endsWith("/revisions")) return ok(revision({ id: "rev-new", number: 2 }));
    if (path.endsWith("/freeze")) return ok(revision({ status: "active", frozen_at: "2026-09-24T09:00:00Z", frozen_by: { id: "u", full_name: "Ahmet Yılmaz" } }));
    return fail(404);
  }) as never);
  const viewResponse = (() => ok(state.view)) as never;
  asMock(backendClient.PATCH).mockImplementation(viewResponse);
  asMock(backendClient.PUT).mockImplementation(viewResponse);
  asMock(backendClient.DELETE).mockImplementation((() => ok(undefined, 204)) as never);
}

/**
 * IZN-F6a.3 · eski `earned_value` modül seviyesi niyeti sayfa izni oturumu olarak kurulur (`evMe`);
 * `null` = tam yetkili sistem yöneticisi (eski "bilinmezlik" = her şey açık).
 */
export function mockPermission(level: string | null) {
  asMock(useSession).mockReturnValue({ me: evMe(level), isLoading: false } as never);
}

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Son çağrının gövdesi (`body`). */
export function lastBody(method: "PATCH" | "PUT" | "POST" | "DELETE", pathSuffix: string): unknown {
  const calls = asMock(backendClient[method]).mock.calls.filter((c) => String(c[0]).endsWith(pathSuffix));
  const last = calls.at(-1);
  return last ? (last[1] as { body?: unknown }).body : undefined;
}
