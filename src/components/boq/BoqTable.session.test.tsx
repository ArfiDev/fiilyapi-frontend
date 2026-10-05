import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SessionProvider } from "@/components/shell/SessionProvider";
import { BoqTable } from "./BoqTable";
import type { BoqTotals } from "@/lib/api/hooks/useBoq";

// DSC-F1.3 · GERÇEK hook + GERÇEK SessionProvider (mock'suz): `/api/auth/me`
// yanıtındaki `projects[].discipline_ids` kısıt kararını sürer.
vi.mock("next/navigation", () => ({ useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }));

const TOTALS = {
  grand_total: "0.00",
  grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
} as unknown as BoqTotals;

type DisciplineRef = { id: string; code: string; name: string; color: string };

// IZN-F3.1c: `me.disciplines` kalktı → atama `me.projects[].discipline_ids`; adlar şirket disiplin kataloğundan çözülür.
let catalog: DisciplineRef[] = [];

function stubMe(disciplines: DisciplineRef[]) {
  catalog = disciplines;
  const me = {
    id: "u1",
    all_projects: false,
    projects: [{ project_id: "p-1", role_key: "x", discipline_ids: disciplines.map((d) => d.id) }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => me })),
  );
}

function renderWithSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["ev-disciplines"], catalog);
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <BoqTable groups={[]} totals={TOTALS} />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("BoqTable — gerçek oturum bağı (DSC-F1.3)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("projelerde disiplin yok → bugünkü metin", async () => {
    stubMe([]);
    renderWithSession();
    expect(await screen.findByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("projede disiplin atanmış → kısıtlı bildirim (ad katalogdan)", async () => {
    stubMe([{ id: "d1", code: "KAB", name: "Kaba İnşaat", color: "#0055aa" }]);
    renderWithSession();
    expect(await screen.findByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(screen.queryByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).not.toBeInTheDocument();
  });
});
