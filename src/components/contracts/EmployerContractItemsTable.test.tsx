import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { EmployerContractItemsTable } from "./EmployerContractItemsTable";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

/**
 * no 52 — `commitCell`'in "noop" dalı (değer değişmedi/hücreye dokunulmadı)
 * `setClientError`i HİÇ çağırmıyordu; yalnız `error` ve başarı dalları
 * güncelliyordu. Kullanıcı geçersiz bir değer yazıp odağı çıkardığında hata
 * bandı basılır, ardından değeri SUNUCU değerine geri getirse (görünürde
 * "değişmemiş" bir noop) hata bandı EKRANDA KALIYORDU.
 */

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const GROUP_ID = "gggggggg-0000-0000-0000-000000000002";
const ITEM_CODE = "03.011";

const DETAIL = {
  project_id: PROJECT_ID,
  amount: "22400000.00",
  items_total: "1000.00",
  items_total_diff: "0.00",
} as EmployerContractDetail;

const DATA: EmployerContractItemsResponse = {
  groups: [
    {
      id: GROUP_ID,
      name: "B — Betonarme İşleri",
      sort_order: 20,
      items: [
        {
          id: "iiiiiiii-0000-0000-0000-000000000001",
          group_id: GROUP_ID,
          code: ITEM_CODE,
          description: "Grobeton",
          unit: "m³",
          quantity: "100.000",
          unit_price: "1200.00",
          sort_order: 10,
          distributed_quantity: "40.000",
          remaining_quantity: "60.000",
        },
      ],
    },
  ],
} as EmployerContractItemsResponse;

function renderTable() {
  return render(
    <EmployerContractItemsTable
      projectId={PROJECT_ID}
      detail={DETAIL}
      isError={false}
      isLoading={false}
      data={DATA}
      onAddItem={vi.fn()}
      onCommitItem={vi.fn()}
      onCreateItem={vi.fn().mockResolvedValue(true)}
      isBusy={false}
      saveError={null}
    />,
  );
}

describe("EmployerContractItemsTable — hücre içi doğrulama hatası noop'ta temizlenir (no 52)", () => {
  it("geçersiz girdi hatası basılır, ardından sunucu değerine dönülünce (noop) hata TEMİZLENİR", () => {
    renderTable();
    const quantityInput = screen.getByLabelText(`${ITEM_CODE} miktar`);

    fireEvent.change(quantityInput, { target: { value: "-5" } });
    fireEvent.blur(quantityInput);
    expect(screen.getByTestId("ecd-items-error")).toHaveTextContent(
      "Miktar sıfırdan büyük olmalıdır.",
    );

    // Kullanıcı hücreyi SUNUCU değerine geri getirir (görüntüde "100") —
    // `commitInlineCell` bunu "noop" sayar (değer değişmedi).
    fireEvent.change(quantityInput, { target: { value: "100" } });
    fireEvent.blur(quantityInput);

    expect(screen.queryByTestId("ecd-items-error")).not.toBeInTheDocument();
  });
});

/**
 * SEKME-F1.3b · merkezi kayda bağlanma bekçisi. Hücre-içi `drafts` (odak
 * çıkışında ANINDA kaydolur) BİLEREK dışarıda tutulur — yalnız "+ Satır Ekle"
 * taslağı commit edilmemiş sayılır.
 */
describe("EmployerContractItemsTable — kaydedilmemiş değişiklik kaydı (yalnız + Satır Ekle taslağı)", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderTable();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("hücre-içi düzenleme (drafts) kirli SAYILMAZ — anında kaydolur", () => {
    renderTable();
    const quantityInput = screen.getByLabelText(`${ITEM_CODE} miktar`);
    fireEvent.change(quantityInput, { target: { value: "150" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("+ Satır Ekle açıldı, bir alan dolduruldu → kirli", () => {
    renderTable();
    fireEvent.click(screen.getByTestId(`ecd-add-row-${GROUP_ID}`));
    fireEvent.change(screen.getByLabelText("Yeni poz no"), { target: { value: "03.012" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("Vazgeç taslağı sıfırlar → temiz", () => {
    renderTable();
    fireEvent.click(screen.getByTestId(`ecd-add-row-${GROUP_ID}`));
    fireEvent.change(screen.getByLabelText("Yeni poz no"), { target: { value: "03.012" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("ecd-new-row-cancel"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
