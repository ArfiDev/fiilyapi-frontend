/**
 * TKL-F1.3 · İş Kalemi Kataloğu ekran testlerinin ORTAK istemci taklidi.
 * 🔴 Test-DIŞI adlıdır; `vitest` İMPORT EDEMEZ (`src/lib/api/` stub bekçisi gibi) —
 * `vi.mocked` yalnız bir TİP dökümüdür, çalışma zamanında sahte fonksiyonun kendi
 * metodu çağrılır.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { WorkItemCatalogScreen } from "./WorkItemCatalogScreen";

interface MockSurface {
  mockImplementation(impl: unknown): unknown;
  mock: { calls: unknown[][] };
}
const asMock = (fn: unknown): MockSurface => fn as MockSurface;

export function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

export function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

export interface ApiState {
  disciplines: WorkDisciplineRead[];
  items: WorkItemRead[];
}

/** GET'leri yola göre yanıtlar; yazma uçlarını test kendisi kurar. */
export function mockGets(state: ApiState): void {
  asMock(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: state.disciplines });
    if (path === "/catalog/items") return ok({ items: state.items });
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

/** `/catalog/items` GET'i verilen durumla döner (403 vb.); disiplinler normal. */
export function mockItemsFailure(status: number, detail: string, disciplines: WorkDisciplineRead[]): void {
  asMock(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: disciplines });
    if (path === "/catalog/items") return fail(status, detail);
    throw new Error(`beklenmeyen GET ${path}`);
  }) as never);
}

export function getCalls(): string[] {
  return asMock(backendClient.GET).mock.calls.map((call) => String(call[0]));
}

export function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkItemCatalogScreen />
    </QueryClientProvider>,
  );
}
