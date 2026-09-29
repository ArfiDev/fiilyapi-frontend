import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SessionProvider } from "@/components/shell/SessionProvider";
import { BoqTable } from "./BoqTable";
import type { BoqTotals } from "@/lib/api/hooks/useBoq";

// DSC-F1.3 · GERÇEK hook + GERÇEK SessionProvider (mock'suz): `/api/auth/me`
// yanıtındaki `disciplines` boş liste kararını sürer.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const TOTALS = {
  grand_total: "0.00",
  grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
} as unknown as BoqTotals;

function stubMe(disciplines: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "u1", disciplines }) })),
  );
}

function renderWithSession() {
  return render(
    <SessionProvider>
      <BoqTable groups={[]} totals={TOTALS} />
    </SessionProvider>,
  );
}

describe("BoqTable — gerçek oturum bağı (DSC-F1.3)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("me.disciplines=[] → bugünkü metin", async () => {
    stubMe([]);
    renderWithSession();
    expect(await screen.findByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("me.disciplines=[uuid] → kısıtlı bildirim", async () => {
    stubMe([{ id: "d1", code: "KAB", name: "Kaba İnşaat", color: "#0055aa" }]);
    renderWithSession();
    expect(await screen.findByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(screen.queryByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).not.toBeInTheDocument();
  });
});
