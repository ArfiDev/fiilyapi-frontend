import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PayrollLineResponse } from "@/lib/api/hooks/usePayroll";
import { useUpdatePayrollLineSplit } from "@/lib/api/hooks/usePayrollMutations";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { PayrollLineRow } from "./PayrollLineRow";

vi.mock("@/lib/api/hooks/usePayrollMutations", () => ({
  useUpdatePayrollLineSplit: vi.fn(),
}));

function line(overrides: Partial<PayrollLineResponse> = {}): PayrollLineResponse {
  return {
    id: "line-1",
    personnel_id: "p-1",
    personnel_name: "Ayşe Demir",
    personnel_source: "company",
    days: "21",
    gross_amount: "37800.00",
    deduction_amount: "11262.00",
    net_amount: "26538.00",
    bank_amount: "26538.00",
    cash_amount: "0.00",
    status: "pending",
    excluded_reason: null,
    is_overridden: false,
    overridden_at: null,
    previous_gross_amount: null,
    tax_base_amount: null,
    cumulative_tax_base: null,
    income_tax_amount: null,
    ...overrides,
  };
}

function mockMutation() {
  vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({
    mutateAsync: vi.fn(async () => undefined),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdatePayrollLineSplit>);
}

function renderRow(payrollLine: PayrollLineResponse, canWrite = true) {
  return render(
    <table>
      <tbody>
        <PayrollLineRow line={payrollLine} canWrite={canWrite} />
      </tbody>
    </table>,
  );
}

/**
 * 🔴 triyaj #150 — `useState(() => amountFieldValue(line.bank_amount))`
 * yalnız ilk mount'ta kurulur; satır `key={line.id}` ile hiç remount
 * olmadığından PATCH sonrası invalidation ile gelen yeni `bank_amount`/
 * `cash_amount` kutulara YANSIMIYORDU.
 */
describe("PayrollLineRow · sunucu değeri senkronu", () => {
  it("ilk render'da banka/elden sunucu değerini basar", () => {
    mockMutation();
    renderRow(line());
    expect(screen.getByTestId("bordro-line-line-1-bank")).toHaveValue("26538.00");
    expect(screen.getByTestId("bordro-line-line-1-cash")).toHaveValue("0.00");
  });

  it("🔴 satır remount olmadan sunucu tutarı değişince kutular GÜNCELLENİR (bayat kalmaz)", () => {
    mockMutation();
    const { rerender } = render(
      <table>
        <tbody>
          <PayrollLineRow line={line()} canWrite={true} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("bordro-line-line-1-bank")).toHaveValue("26538.00");

    // Aynı `line.id` ile YENİ bir tutar — invalidation sonrası refetch benzeri.
    rerender(
      <table>
        <tbody>
          <PayrollLineRow
            line={line({ bank_amount: "20000.00", cash_amount: "6538.00" })}
            canWrite={true}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByTestId("bordro-line-line-1-bank")).toHaveValue("20000.00");
    expect(screen.getByTestId("bordro-line-line-1-cash")).toHaveValue("6538.00");
  });
});

/**
 * SEKME-F1.3-FIX O6 · sunucu "26538.00" gönderir, kullanıcı biçimi DEĞİL
 * DEĞERİ aynı olan "26538" yazar — eski `isDirty` (ham metin karşılaştırması)
 * bunu KALICI kirli sayıyordu: satır asla temizlenmiyor ve odak çıkışında
 * GEREKSİZ bir PATCH atılıyordu (sunucu zaten aynı değeri döner, sonsuz
 * döngü riski). Karşılaştırma artık ondalık NORMALİZASYONLA yapılır
 * (`compareDecimalStrings` — `Number()` YASAK, K18/ROUND_HALF_UP kanonu).
 */
describe("PayrollLineRow · ondalık normalizasyonlu kirli karşılaştırması (O6)", () => {
  it("aynı tutarı farklı biçimde yazınca (26538.00 → 26538) satır KİRLİ sayılmaz, gereksiz PATCH atılmaz", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn(async () => undefined);
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdatePayrollLineSplit>);
    renderRow(line({ bank_amount: "26538.00" }));

    const bank = screen.getByTestId("bordro-line-line-1-bank");
    await user.clear(bank);
    await user.type(bank, "26538");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.tab();
    await user.tab(); // odak satırdan çıkar

    // Değer sunucudakiyle SAYISAL olarak aynı — gereksiz PATCH atılmamalı.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("GERÇEKTEN farklı bir tutar yazınca satır kirli sayılır ve PATCH atılır", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn(async () => undefined);
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdatePayrollLineSplit>);
    renderRow(line({ bank_amount: "26538.00" }));

    const bank = screen.getByTestId("bordro-line-line-1-bank");
    await user.clear(bank);
    await user.type(bank, "20000");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.tab();
    await user.tab();

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        lineId: "line-1",
        bankAmount: "20000",
        cashAmount: "0.00",
      }),
    );
  });
});

/**
 * SEKME-F1.3-FIX O7 · `PayrollLineRow`in `useUnsavedChanges` bağlanması için
 * davranış bekçisi (merkezi kayıt, düğme/PATCH DEĞİL).
 */
describe("PayrollLineRow — unsavedRegistry davranış bekçisi (O7)", () => {
  it("yükle, dokunma → temiz; tutar değiştir → kirli; sunucu yeni değerle GÜNCELLENİNCE (kayıt sonrası) → tekrar temiz", async () => {
    const user = userEvent.setup();
    mockMutation();
    const { rerender } = render(
      <table>
        <tbody>
          <PayrollLineRow line={line({ bank_amount: "26538.00" })} canWrite={true} />
        </tbody>
      </table>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    const bank = screen.getByTestId("bordro-line-line-1-bank");
    await user.clear(bank);
    await user.type(bank, "20000");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // Kaydetme sonrası invalidation: satır YENİ sunucu değeriyle geri gelir.
    rerender(
      <table>
        <tbody>
          <PayrollLineRow line={line({ bank_amount: "20000.00" })} canWrite={true} />
        </tbody>
      </table>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
