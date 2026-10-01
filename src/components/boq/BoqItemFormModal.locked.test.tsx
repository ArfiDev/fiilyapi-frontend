import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { BoqItemFormModal } from "./BoqItemFormModal";
import {
  useCreateBoqGroup,
  useCreateBoqItem,
  useDeleteBoqItem,
  useUpdateBoqItem,
} from "@/lib/api/hooks/useBoqMutations";
import { employerContractTabHref } from "@/components/contracts/employer-contract-tabs";
import type { BoqGroup, BoqItem } from "@/lib/api/hooks/useBoq";

vi.mock("@/lib/api/hooks/useBoqMutations", () => ({
  useCreateBoqGroup: vi.fn(),
  useCreateBoqItem: vi.fn(),
  useDeleteBoqItem: vi.fn(),
  useUpdateBoqItem: vi.fn(),
}));

/**
 * SZK-F2 — şantiye kaleminde sözleşme alanları kilidi (SOZLESME-KALEM-KILIDI-SPEC
 * Z1–Z3). Kilitli: poz no, tarif, birim, birim fiyat. Açık: miktar, grup, sıra.
 */

const SITE_ID = "44444444-4444-4444-4444-444444444444";
const PROJECT_ID = "55555555-5555-5555-5555-555555555555";
const GROUP_1 = "gggggggg-0000-0000-0000-000000000001";
const CONTRACT_ITEM_ID = "cccccccc-0000-0000-0000-000000000001";
const LOCK_REASON = "Sözleşmeden gelir — sözleşmede düzenleyin";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    code: "01.001",
    description: "Kazı (Makine ile)",
    unit: "m³",
    quantity: "1240.000",
    unit_price: "280.00",
    amount: "347200.00",
    sort_order: 5,
    contract_item_id: null,
    allocated_quantity: "0.000",
    unallocated_quantity: "1240.000",
    progress_pct: { available: false, value: null, pending_module: "progress_payments" },
    ...overrides,
  };
}

const GROUPS: BoqGroup[] = [
  { id: GROUP_1, name: "Toprak ve Temel İşleri", sort_order: 10, group_total: "0.00", items: [] },
];

const updateItem = vi.fn();

function renderEdit(boqItem: BoqItem) {
  render(
    <BoqItemFormModal
      siteId={SITE_ID}
      projectId={PROJECT_ID}
      groups={GROUPS}
      mode={{ kind: "edit", item: boqItem, groupId: GROUP_1 }}
      canDelete
      onClose={vi.fn()}
    />,
  );
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
}

async function savedBody(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
  return updateItem.mock.calls[0][0].body;
}

beforeEach(() => {
  vi.clearAllMocks();
  const idle = (fn: unknown) => ({ mutateAsync: fn, isPending: false }) as never;
  vi.mocked(useCreateBoqGroup).mockReturnValue(idle(vi.fn()));
  vi.mocked(useCreateBoqItem).mockReturnValue(idle(vi.fn()));
  vi.mocked(useDeleteBoqItem).mockReturnValue(idle(vi.fn()));
  vi.mocked(useUpdateBoqItem).mockReturnValue(idle(updateItem));
  updateItem.mockResolvedValue({ id: "edited" });
});

describe("BoqItemFormModal — sözleşmeye bağlı kalem kilidi (Z1/Z2)", () => {
  const linked = () => item({ contract_item_id: CONTRACT_ITEM_ID });

  it("poz no, tarif, birim ve birim fiyat devre dışıdır; miktar açıktır", () => {
    renderEdit(linked());
    for (const label of ["Poz No", "İş Kalemi Tarifi", "Birim", "Birim Fiyat"]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByLabelText("Miktar")).toBeEnabled();
    expect(screen.getByLabelText("Grup")).toBeEnabled();
  });

  it("görünür gerekçe ve sözleşme kalemleri sekmesine bağlantı basılır", () => {
    renderEdit(linked());
    expect(screen.getByText(LOCK_REASON)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sözleşme/i });
    expect(link).toHaveAttribute("href", employerContractTabHref(PROJECT_ID, "items"));
  });

  it("kayıtta kilitli alanlar gövdede YOKTUR, miktar değişikliği VARDIR", async () => {
    // Sunucu kodu sondaki boşlukla gelir: trim karşılaştırması "değişti" der.
    // Kilit gövde düzeyinde de tutulmazsa `code` sızar (değişmemiş sayılsa bile).
    renderEdit(item({ contract_item_id: CONTRACT_ITEM_ID, code: "01.001 " }));
    setField("Miktar", "1300");
    save();
    const body = await savedBody();
    expect(body).toEqual({ quantity: "1300" });
    for (const key of ["code", "description", "unit", "unit_price"]) {
      expect(body).not.toHaveProperty(key);
    }
  });
});

describe("BoqItemFormModal — bağsız kalem (Z3)", () => {
  it("bağsız kalemde bütün alanlar açıktır ve gerekçe basılmaz", () => {
    renderEdit(item());
    for (const label of ["Poz No", "İş Kalemi Tarifi", "Birim", "Birim Fiyat", "Miktar"]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    expect(screen.queryByText(LOCK_REASON)).not.toBeInTheDocument();
  });

  it("'280.00' sunucu değeri '280' yazılınca unit_price gövdede YOKTUR", async () => {
    renderEdit(item({ unit_price: "280.00" }));
    setField("Birim Fiyat", "280");
    setField("Miktar", "1300");
    save();
    const body = await savedBody();
    expect(body).toEqual({ quantity: "1300" });
  });

  it("'281' yazılınca unit_price gövdede VARDIR", async () => {
    renderEdit(item({ unit_price: "280.00" }));
    setField("Birim Fiyat", "281");
    save();
    const body = await savedBody();
    expect(body).toEqual({ unit_price: "281" });
  });
});
