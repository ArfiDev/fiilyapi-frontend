import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { BoqItemPickerModal } from "./BoqItemPickerModal";
import type { BoqGroup } from "@/lib/api/hooks/useBoq";

// DSC-F1.3 · kısıtlı kullanıcıda TÜM poz listesi boşken bildirim; süzgeç boşluğu değişmez.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const NO_ITEMS_TEXT = "Bu şantiyede henüz iş kalemi yok — önce İş Kalemleri ekranından poz ekleyin.";

const ONE_EXHAUSTED_GROUP = [
  {
    id: "bg-1",
    name: "BETONARME",
    sort_order: 10,
    group_total: "0",
    items: [
      {
        id: "bi-2",
        code: "03.020",
        description: "Tuğla Duvar",
        unit: "m²",
        quantity: "5800.000",
        unit_price: "280.00",
        amount: "0",
        sort_order: 1,
        allocated_quantity: "5800.000",
        unallocated_quantity: "0.000",
        progress_pct: { available: false, value: null, pending_module: "x" },
      },
    ],
  },
] as unknown as BoqGroup[];

function renderPicker(groups: BoqGroup[]) {
  render(
    <BoqItemPickerModal
      groups={groups}
      sectionQuantities={new Map()}
      draft={new Map()}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("BoqItemPickerModal — kısıtlı boş durum (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı + hiç poz yok → ortak bildirim", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    renderPicker([]);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(NO_ITEMS_TEXT)).not.toBeInTheDocument();
  });

  it("kısıtlı iken süzgeç boşluğu (poz var) eski metni korur", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    renderPicker(ONE_EXHAUSTED_GROUP);
    expect(screen.getByText("Süzgece uyan poz yok.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("atamasız + hiç poz yok → bugünkü metin aynen", () => {
    renderPicker([]);
    expect(screen.getByText(NO_ITEMS_TEXT)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
