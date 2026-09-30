import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AiContextPanel } from "./AiContextPanel";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";
import type { SiteListItem } from "@/lib/api/hooks/useSites";

// DSC-F3a — seçili şantiyenin "İlerleme" satırı (B4 kapsamlı `SiteListItem.progress_pct`).
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", disciplines: session.disciplines }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };

const PROJE = { id: "p-1", name: "Güneşkent Konut" } as unknown as ProjectListItem;
const SANTIYE = {
  id: "s-1",
  name: "A-Blok Şantiyesi",
  progress_pct: { available: true, value: "42.00", pending_module: null },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
} as unknown as SiteListItem;

function renderPanel(seciliSantiye: SiteListItem | null) {
  return render(
    <AiContextPanel
      projeler={[PROJE]}
      seciliProje={PROJE}
      santiyeler={[SANTIYE]}
      seciliSantiye={seciliSantiye}
      santiyelerYukleniyor={false}
      projeYetkisiVar
      akiyor={false}
      simdi={new Date("2026-09-15T10:00:00Z")}
      acilanlar={[]}
      onProjeSec={() => {}}
      onSantiyeSec={() => {}}
      onHizliAnaliz={() => {}}
    />,
  );
}

beforeEach(() => {
  session.disciplines = [];
});

describe("AiContextPanel ilerleme etiketi — DSC-F3a", () => {
  it("kısıtsız: 'İlerleme' aynen", () => {
    renderPanel(SANTIYE);
    const row = screen.getByTestId("ai-baglam-ilerleme").parentElement as HTMLElement;
    expect(within(row).getByText("İlerleme")).toBeInTheDocument();
  });

  it("kısıtlı: 'Fiziksel (disiplinlerim)'", () => {
    session.disciplines = [KAB];
    renderPanel(SANTIYE);
    const row = screen.getByTestId("ai-baglam-ilerleme").parentElement as HTMLElement;
    expect(within(row).getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(within(row).queryByText("İlerleme")).not.toBeInTheDocument();
  });

  it("şantiye seçilmemiş kapsam satırı ('İlerleme') kısıtlıda da DEĞİŞMEZ (değer yok)", () => {
    session.disciplines = [KAB];
    renderPanel(null);
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
  });
});
