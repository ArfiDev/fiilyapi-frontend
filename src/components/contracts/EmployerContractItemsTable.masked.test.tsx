import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmployerContractItemsTable } from "./EmployerContractItemsTable";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

/**
 * KAPSAM MASKESİ — "Kalan" rozeti (POZ 100).
 *
 * 🔴 `remaining_quantity` `Gorunurluk.operasyonel` etiketlidir; `finance`
 * kapsamlı rol (izin matrisinde `contracts` satırının muhasebe hücresi) onu
 * `null` görür. `Number(null)` **0**'dır — yani korumasız bir okuma HER satırı
 * yeşil "✓ 0" ile "tamamı dağıtıldı" diye damgalar ve kullanıcı dağıtımı
 * BİTMİŞ sanır. Bu, gizlemekten daha kötüdür: sahte bir olumlu iddiadır.
 *
 * Ölçülmüş olgu: backend `remaining_quantity`yi `item.quantity - distributed`
 * ile HER ZAMAN üretir (`contracts/service.py:409`) — yani yanıtta `null`
 * görülmesinin TEK sebebi maskedir, "veri yok" hâli yoktur.
 *
 * Kanon `distribution-derive.ts::isRemainingSettled` ile AYNIDIR; bu tablo o
 * kararın ikiz yüzeyidir ve ondan TÜRETİLİR (ikinci bir eşik kopyası açılmaz).
 */

const PROJECT_ID = "pppppppp-0000-0000-0000-000000000001";
const GROUP_ID = "gggggggg-0000-0000-0000-000000000002";

const DETAIL = {
  project_id: PROJECT_ID,
  amount: "22400000.00",
  items_total: "1000.00",
  items_total_diff: "0.00",
} as EmployerContractDetail;

function itemsWith(remaining: string | null): EmployerContractItemsResponse {
  return {
    groups: [
      {
        id: GROUP_ID,
        name: "B — Betonarme İşleri",
        sort_order: 20,
        items: [
          {
            id: "iiiiiiii-0000-0000-0000-000000000001",
            group_id: GROUP_ID,
            code: "03.011",
            description: "Grobeton",
            unit: "m³",
            quantity: "100.000",
            unit_price: "1200.00",
            sort_order: 10,
            distributed_quantity: "40.000",
            remaining_quantity: remaining,
          },
        ],
      },
    ],
  } as EmployerContractItemsResponse;
}

function renderTable(remaining: string | null) {
  return render(
    <EmployerContractItemsTable
      projectId={PROJECT_ID}
      detail={DETAIL}
      isError={false}
      isLoading={false}
      data={itemsWith(remaining)}
      onAddItem={vi.fn()}
      onCommitItem={vi.fn()}
      onCreateItem={vi.fn().mockResolvedValue(true)}
      isCreating={false}
      saveError={null}
    />,
  );
}

describe("EmployerContractItemsTable — maskelenmiş kalan metraj KAPANMIŞ sayılmaz", () => {
  it("🔴 maskeli (null) kalan: rozet '—' basar, '✓ 0' BASMAZ", () => {
    renderTable(null);
    const badge = screen.getByTestId("ecd-item-remaining");
    expect(badge).toHaveAttribute("data-settled", "false");
    expect(badge).toHaveTextContent("—");
    expect(badge.textContent).not.toMatch(/0/);
  });

  it("🔴 POZİTİF KONTROL — gerçek 0 HÂLÂ '✓ 0' ile kapanmış basılır", () => {
    renderTable("0.000");
    const badge = screen.getByTestId("ecd-item-remaining");
    expect(badge).toHaveAttribute("data-settled", "true");
    expect(badge).toHaveTextContent("0");
  });

  it("🔴 POZİTİF KONTROL — açık kalan miktar sayı olarak basılır", () => {
    renderTable("60.000");
    const badge = screen.getByTestId("ecd-item-remaining");
    expect(badge).toHaveAttribute("data-settled", "false");
    expect(badge).toHaveTextContent("60");
  });
});
