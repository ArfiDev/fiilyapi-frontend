import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { mockVirtualViewport } from "@/components/catalog-shared/virtual-viewport.testkit";
import { VIRTUALIZE_MIN_ROWS } from "@/components/catalog-shared/virtual-rows";
import { D_DUV, D_KAB, SIVA } from "@/components/work-item-catalog/work-item-fixtures";
import { backendClient } from "@/lib/api/client";
import type { WorkItemRead } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { WorkItemPickerModal } from "./WorkItemPickerModal";

// KAT-F1.2 · sanallaştırılmış seçici (≥ VIRTUALIZE_MIN_ROWS satır). jsdom yerleşim bilmez → `mockVirtualViewport`.
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) }) as never;
const pozOf = (i: number) => `DUV-${String(i + 1000).padStart(4, "0")}`;

function catalogOf(count: number): WorkItemRead[] {
  return Array.from({ length: count }, (_, i) => ({ ...SIVA, id: `m-${i}`, poz_no: pozOf(i), name: `Kalem ${i}` }));
}

function renderPicker(count: number, { preload = false } = {}) {
  vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
    if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
    return ok({ items: catalogOf(count) });
  }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (preload) {
    // Önbellek DOLU (başka ekran/seçici zaten çekti): tablo İLK çizimde sanallaştırılmış gövdeyle açılır.
    client.setQueryData(["catalog-items"], catalogOf(count));
    client.setQueryData(["catalog-disciplines"], [D_KAB, D_DUV]);
  }
  return render(
    <QueryClientProvider client={client}>
      <WorkItemPickerModal groups={[] as never} onSubmit={vi.fn()} onClose={vi.fn()} isSubmitting={false} submitError={null} />
    </QueryClientProvider>,
  );
}

const scroller = () => document.querySelector(".wip-table-scroll") as HTMLElement;
const table = () => screen.getByRole("table");
const dataRows = () => document.querySelectorAll("tr.wip-row");
const rowFor = (pozNo: string) => screen.queryByText(pozNo)?.closest("tr") ?? null;

function scrollTo(top: number) {
  act(() => {
    scroller().scrollTop = top;
    fireEvent.scroll(scroller());
  });
}

let restoreViewport: () => void;
beforeEach(() => {
  vi.clearAllMocks();
  restoreViewport = mockVirtualViewport();
});
afterEach(() => {
  restoreViewport();
  unsavedRegistry.set("test-cleanup", null);
});

describe("seçici sanallaştırma — eşik", () => {
  it(`eşiğin ALTINDA (${VIRTUALIZE_MIN_ROWS - 1} satır) bugünkü DOM: tüm satırlar, aria-rowcount/colgroup/data-index YOK`, async () => {
    renderPicker(VIRTUALIZE_MIN_ROWS - 1);
    await screen.findByText(pozOf(0));
    expect(dataRows()).toHaveLength(VIRTUALIZE_MIN_ROWS - 1);
    expect(table()).not.toHaveAttribute("aria-rowcount");
    expect(table().querySelector("colgroup")).toBeNull();
    expect(table().querySelector("[data-index]")).toBeNull();
    expect(table().querySelector("[aria-rowindex]")).toBeNull();
  });

  it(`eşikte (${VIRTUALIZE_MIN_ROWS} satır) sanallaştırılır: tüm satırlar basılmaz, aria-rowcount toplam`, async () => {
    renderPicker(VIRTUALIZE_MIN_ROWS);
    await screen.findByText(pozOf(0));
    expect(dataRows().length).toBeGreaterThan(0);
    expect(dataRows().length).toBeLessThan(VIRTUALIZE_MIN_ROWS);
    // başlık (1) + disiplin başlık satırı (1) + 100 poz
    expect(table()).toHaveAttribute("aria-rowcount", String(1 + 1 + VIRTUALIZE_MIN_ROWS));
  });
});

describe("seçici sanallaştırma — önbellek dolu açılış", () => {
  it("🔴 veri önbellekten GELİNCE (ilk çizimde sanal gövde) satırlar basılır — kaydırma kabı ref'i geç bağlanmasın", async () => {
    renderPicker(1000, { preload: true });
    expect(await screen.findByText(pozOf(0))).toBeInTheDocument();
    expect(dataRows().length).toBeGreaterThan(0);
    expect(dataRows().length).toBeLessThan(40);
    expect(table()).toHaveAttribute("aria-rowcount", "1002");
  });
});

describe("seçici sanallaştırma — 1.000 satır", () => {
  it("DOM'da yalnız pencere + taşma payı; aria-rowindex gerçek sıra (başlık 1, disiplin satırı 2, ilk poz 3)", async () => {
    renderPicker(1000);
    await screen.findByText(pozOf(0));
    expect(dataRows().length).toBeLessThan(40);
    expect(table()).toHaveAttribute("aria-rowcount", "1002");
    expect(rowFor(pozOf(0))).toHaveAttribute("aria-rowindex", "3");
    expect(rowFor(pozOf(5))).toHaveAttribute("aria-rowindex", "8");
    expect(rowFor(pozOf(999))).toBeNull();
  });

  it("uzağa kaydırınca o bölgedeki satırlar basılır (gerçek sıra korunur), baştakiler çıkar", async () => {
    renderPicker(1000);
    await screen.findByText(pozOf(0));
    scrollTo(64 * 500);
    expect(await screen.findByText(pozOf(500))).toBeInTheDocument();
    expect(rowFor(pozOf(500))).toHaveAttribute("aria-rowindex", "503");
    expect(rowFor(pozOf(0))).toBeNull();
    expect(dataRows().length).toBeLessThan(40);
    // atlanan satırların yerini üst boşluk satırı tutar (kaydırma çubuğu ve konum bozulmaz)
    const spacers = screen.getAllByTestId("wip-spacer");
    expect(Number.parseInt(spacers[0]!.style.height, 10)).toBeGreaterThan(64 * 400);
    expect(spacers[0]!.nextElementSibling).toHaveAttribute("data-index"); // ÜST boşluk: ilk basılan satırın hemen önünde
    expect(spacers.at(-1)!.previousElementSibling).toHaveAttribute("data-index"); // ALT boşluk: son satırın hemen ardında
  });

  it("🔴 seçim pencere dışına çıkan satırda KORUNUR: seç → kaydır → geri dön → hâlâ işaretli", async () => {
    const user = userEvent.setup();
    renderPicker(1000);
    await screen.findByText(pozOf(0));
    await user.click(screen.getByRole("checkbox", { name: `${pozOf(0)} seç` }));
    await user.type(screen.getByLabelText(`${pozOf(1)} miktar`), "7");
    scrollTo(64 * 700);
    await screen.findByText(pozOf(700));
    expect(rowFor(pozOf(0))).toBeNull();
    expect(screen.getByTestId("wip-selected")).toHaveTextContent("2");
    scrollTo(0);
    await screen.findByText(pozOf(0));
    expect(screen.getByRole("checkbox", { name: `${pozOf(0)} seç` })).toBeChecked();
    expect(screen.getByLabelText(`${pozOf(1)} miktar`)).toHaveValue("7");
  });

  it("🔴 odaktaki satır pencere dışına kaydırılsa da DOM'da kalır (odak kaybolmaz); odak çıkınca kalkar", async () => {
    const user = userEvent.setup();
    renderPicker(1000);
    await screen.findByText(pozOf(0));
    const quantity = screen.getByLabelText(`${pozOf(0)} miktar`);
    await user.click(quantity);
    expect(quantity).toHaveFocus();
    scrollTo(64 * 700);
    await screen.findByText(pozOf(700));
    expect(rowFor(pozOf(0))).not.toBeNull();
    expect(screen.getByLabelText(`${pozOf(0)} miktar`)).toHaveFocus();
    act(() => (document.activeElement as HTMLElement).blur());
    scrollTo(64 * 701);
    await screen.findByText(pozOf(701));
    expect(rowFor(pozOf(0))).toBeNull();
  });

  it("tümünü seç sanallaştırılmış listede de 200'de durur (görünmeyen satırlar dahil sayılır)", async () => {
    const user = userEvent.setup();
    renderPicker(1000);
    await screen.findByText(pozOf(0));
    await user.click(screen.getByRole("checkbox", { name: "Görünen pozların tümünü seç" }));
    expect(screen.getByTestId("wip-selected")).toHaveTextContent("200");
    expect(screen.getByTestId("wip-band")).toHaveTextContent("Tek seferde en fazla 200 poz eklenebilir");
  });
});
