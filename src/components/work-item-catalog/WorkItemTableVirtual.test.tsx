import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { mockVirtualViewport } from "@/components/catalog-shared/virtual-viewport.testkit";
import { VIRTUALIZE_MIN_ROWS } from "@/components/catalog-shared/virtual-rows";
import type { WorkItemRead } from "@/lib/api/models";

import { BETON, D_KAB } from "./work-item-fixtures";
import { WorkItemTable, type WorkItemTableProps } from "./WorkItemTable";
import { editDraftFromItem, type WorkItemDraft } from "./work-item-drafts";

// KAT-F1.2 · sanallaştırılmış katalog tablosu (≥ VIRTUALIZE_MIN_ROWS kalem; sayfa/pencere kaydırması).
const NOW = new Date("2026-09-24T09:00:00Z");
const pozOf = (i: number) => `KAB-${String(i + 1000).padStart(4, "0")}`;

function itemsOf(count: number): WorkItemRead[] {
  return Array.from({ length: count }, (_, i) => ({ ...BETON, id: `m-${i}`, poz_no: pozOf(i), name: `Kalem ${i}` }));
}

function renderTable(count: number, over: Partial<WorkItemTableProps> = {}) {
  const props: WorkItemTableProps = {
    items: itemsOf(count),
    newDrafts: [],
    editDrafts: new Map(),
    disciplines: [D_KAB],
    now: NOW,
    canWrite: true,
    catalogUnits: ["m³"],
    onEdit: vi.fn(),
    onPatch: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...over,
  };
  const view = render(<WorkItemTable {...props} />);
  return { props, view };
}

const table = () => screen.getByRole("table", { name: "İş kalemleri" });
const bodyRows = () => document.querySelectorAll('[role="row"].wik-row');
const rowFor = (pozNo: string) => screen.queryByText(pozNo)?.closest('[role="row"]') ?? null;

function scrollWindowTo(top: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: top });
    fireEvent.scroll(window);
  });
}

let restoreViewport: () => void;
beforeEach(() => {
  restoreViewport = mockVirtualViewport();
});
afterEach(() => {
  restoreViewport();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("katalog tablosu sanallaştırma — eşik", () => {
  it(`eşiğin ALTINDA (${VIRTUALIZE_MIN_ROWS - 1} kalem) bugünkü DOM: tüm satırlar, aria-rowcount/rowindex/data-index YOK`, () => {
    renderTable(VIRTUALIZE_MIN_ROWS - 1);
    expect(bodyRows()).toHaveLength(VIRTUALIZE_MIN_ROWS - 1);
    expect(table()).not.toHaveAttribute("aria-rowcount");
    expect(table().querySelector("[aria-rowindex]")).toBeNull();
    expect(table().querySelector("[data-index]")).toBeNull();
  });

  it(`eşikte (${VIRTUALIZE_MIN_ROWS} kalem) sanallaştırılır: yalnız pencere basılır, aria-rowcount = başlık + kalemler`, () => {
    renderTable(VIRTUALIZE_MIN_ROWS);
    expect(bodyRows().length).toBeGreaterThan(0);
    expect(bodyRows().length).toBeLessThan(VIRTUALIZE_MIN_ROWS);
    expect(table()).toHaveAttribute("aria-rowcount", String(1 + VIRTUALIZE_MIN_ROWS));
  });
});

describe("katalog tablosu sanallaştırma — 1.000 kalem", () => {
  it("tablo semantiği korunur: role=table/rowgroup/row/cell, başlık aria-rowindex=1, ilk kalem 2", () => {
    renderTable(1000);
    expect(table()).toHaveAttribute("aria-rowcount", "1001");
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".wik-head")).toHaveAttribute("aria-rowindex", "1");
    expect(rowFor(pozOf(0))).toHaveAttribute("aria-rowindex", "2");
    expect(rowFor(pozOf(3))).toHaveAttribute("aria-rowindex", "5");
    expect(screen.getAllByRole("cell").length).toBeGreaterThan(0);
    expect(bodyRows().length).toBeLessThan(40);
  });

  it("yeni taslak satırları kalem satırlarının ÖNÜNDE sayılır (aria-rowindex kayar)", () => {
    const newDraft: WorkItemDraft = { ...editDraftFromItem(BETON), key: "new-1", itemId: null };
    renderTable(1000, { newDrafts: [newDraft] });
    expect(table()).toHaveAttribute("aria-rowcount", "1002");
    expect(rowFor(pozOf(0))).toHaveAttribute("aria-rowindex", "3");
  });

  it("kaydırınca ilgili bölgenin satırları gerçek sırasıyla basılır", () => {
    renderTable(1000);
    scrollWindowTo(64 * 400);
    expect(screen.getByText(pozOf(400))).toBeInTheDocument();
    expect(rowFor(pozOf(400))).toHaveAttribute("aria-rowindex", "402");
    expect(rowFor(pozOf(0))).toBeNull();
    expect(bodyRows().length).toBeLessThan(40);
  });

  it("🔴 DÜZENLEME satırı kaydırınca KAYBOLMAZ: açık taslak pencere dışında da DOM'da kalır", () => {
    const item = itemsOf(1000)[2]!;
    const draft = editDraftFromItem(item);
    const { view, props } = renderTable(1000, { editDrafts: new Map([[item.id, draft]]) });
    expect(screen.getByTestId(`wik-edit-${item.id}`)).toBeInTheDocument();
    scrollWindowTo(64 * 800);
    expect(screen.getByText(pozOf(800))).toBeInTheDocument();
    expect(rowFor(pozOf(0))).toBeNull(); // sıradan satırlar çıktı
    expect(screen.getByTestId(`wik-edit-${item.id}`)).toBeInTheDocument(); // düzenleme satırı kaldı
    scrollWindowTo(0);
    expect(screen.getByTestId(`wik-edit-${item.id}`)).toBeInTheDocument();
    view.unmount();
    expect(props.onCancel).not.toHaveBeenCalled(); // taslak üst bileşende: unmount iptal DEĞİL
  });

  it("🔴 odaktaki 'Düzenle' düğmesinin satırı pencere dışına kaydırılsa da DOM'da kalır", () => {
    renderTable(1000);
    const button = screen.getByRole("button", { name: `${pozOf(1)} · Kalem 1 düzenle` });
    act(() => button.focus());
    expect(button).toHaveFocus();
    scrollWindowTo(64 * 800);
    expect(screen.getByText(pozOf(800))).toBeInTheDocument();
    expect(rowFor(pozOf(1))).not.toBeNull();
    expect(button).toHaveFocus();
  });
});
