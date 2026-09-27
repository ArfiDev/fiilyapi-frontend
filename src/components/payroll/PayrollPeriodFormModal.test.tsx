import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PayrollPeriodListRow } from "@/lib/api/hooks/usePayroll";
import { useCreatePayrollPeriod } from "@/lib/api/hooks/usePayrollMutations";

import { MAX_PAYROLL_YEAR, MIN_PAYROLL_YEAR } from "./payroll-derive";
import {
  OPEN_PERIOD_CANCEL_LABEL,
  OPEN_PERIOD_DUE_HINT,
  OPEN_PERIOD_NOTICE_BODY,
  OPEN_PERIOD_NOTICE_TITLE,
  OPEN_PERIOD_STEP,
} from "./payroll-labels";
import { PayrollPeriodFormModal } from "./PayrollPeriodFormModal";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/usePayrollMutations", () => ({
  useCreatePayrollPeriod: vi.fn(),
}));

/**
 * F-BORDRO T2 · "Dönem Aç" diyaloğu.
 *
 * 🔴 Bu testin ASIL İŞİ **gövdeyi uçtan ölçülen şemaya sabitlemektir**
 * (`PayrollPeriodCreate`: `year` · `month` · opsiyonel `payment_due_date`;
 * `extra="forbid"`). Şema `forbid` olduğu için fazladan TEK bir alan bile
 * 422 üretir ve bu YALNIZ canlıda görülürdü — jsdom'da gövdeyi iddia etmek
 * o sınıfı buraya taşır.
 */

function periodRow(year: number, month: number): PayrollPeriodListRow {
  return {
    id: `pp-${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    status: "draft",
    payment_due_date: null,
    paid_at: null,
    personnel_count: 0,
    gross_total: "0.00",
    sgk_employer_total: "0.00",
    net_total: "0.00",
    total_cost: "0.00",
  } as unknown as PayrollPeriodListRow;
}

const mutateAsync = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

function setMutation(partial: Record<string, unknown> = {}) {
  vi.mocked(useCreatePayrollPeriod).mockReturnValue({
    isPending: false,
    mutateAsync,
    ...partial,
  } as unknown as ReturnType<typeof useCreatePayrollPeriod>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ id: "pp-2026-08" });
  setMutation();
});

const ROWS = [periodRow(2026, 6), periodRow(2026, 7)];

function renderModal(rows: readonly PayrollPeriodListRow[] = ROWS) {
  return render(
    <PayrollPeriodFormModal rows={rows} onClose={onClose} onCreated={onCreated} />,
  );
}

describe("PayrollPeriodFormModal · açılış değerleri", () => {
  it("en yeni dönemin BİR SONRAKİ ayını önerir", () => {
    renderModal();
    expect(screen.getByTestId("bordro-open-year")).toHaveValue(2026);
    expect(screen.getByTestId("bordro-open-month")).toHaveValue("8");
  });

  it("hiç dönem yoksa alanlar BOŞ açılır (uydurma yıl basılmaz)", () => {
    renderModal([]);
    expect(screen.getByTestId("bordro-open-year")).toHaveValue(null);
    expect(screen.getByTestId("bordro-open-month")).toHaveValue("");
    // Kapı kapalı ve gerekçe GÖRÜNÜR.
    expect(screen.getByTestId("bordro-open-submit")).toBeDisabled();
    expect(screen.getByTestId("bordro-open-block-reason")).toHaveTextContent("Yıl girin.");
  });

  it("son ödeme tarihi OPSİYONELDİR — boş açılır ve kapıyı kapatmaz", () => {
    renderModal();
    expect(screen.getByTestId("bordro-open-due")).toHaveValue("");
    expect(screen.getByTestId("bordro-open-submit")).toBeEnabled();
  });
});

describe("PayrollPeriodFormModal · gövde uçtan ölçülen şemaya uyar", () => {
  it("tarih girilmezse `payment_due_date` gövdeye HİÇ eklenmez", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("bordro-open-submit"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // 🔴 TAM KÜME iddiası: `toMatchObject` değil `toEqual` — fazladan bir alan
    // (örn. `status`) sızsaydı `extra="forbid"` yüzünden canlıda 422 olurdu.
    expect(mutateAsync).toHaveBeenCalledWith({ year: 2026, month: 8 });
  });

  it("tarih girilirse ISO olarak gövdeye girer", async () => {
    const user = userEvent.setup();
    renderModal();

    // `DateInput` TR yazar, ISO taşır — dönüşüm primitive'in sözleşmesidir.
    await user.type(screen.getByTestId("bordro-open-due"), "05.09.2026");
    await user.click(screen.getByTestId("bordro-open-submit"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      year: 2026,
      month: 8,
      payment_due_date: "2026-09-05",
    });
  });

  it("başarıda açılan dönem ÇAĞIRANA bildirilir ve diyalog kapanır", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("bordro-open-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("pp-2026-08"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollPeriodFormModal · kapı ve hata", () => {
  it("zaten açılmış ay gönderilmeden ÖNCE elenir", async () => {
    const user = userEvent.setup();
    renderModal();

    // Temmuz 2026 zaten açık.
    await user.selectOptions(screen.getByTestId("bordro-open-month"), "7");

    expect(screen.getByTestId("bordro-open-block-reason")).toHaveTextContent(
      "zaten açılmış",
    );
    expect(screen.getByTestId("bordro-open-submit")).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sunucu hatası SESSİZCE YUTULMAZ; diyalog AÇIK kalır", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error("Bu dönem zaten açılmış."));
    renderModal();

    await user.click(screen.getByTestId("bordro-open-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("bordro-open-error")).toBeInTheDocument(),
    );
    // 🔴 Hata hâlinde kapanmak, kullanıcının yazdıklarını sessizce ÇÖPE atardı.
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("gönderim sürerken alanlar ve düğmeler KİLİTLİDİR (tek uçuş)", () => {
    setMutation({ isPending: true });
    renderModal();

    expect(screen.getByTestId("bordro-open-submit")).toBeDisabled();
    expect(screen.getByTestId("bordro-open-month")).toBeDisabled();
    expect(screen.getByTestId("bordro-open-year")).toBeDisabled();
  });
});

/* ══ F-BORDONEM · mockup `Form - Donem Ac.dc.html` ("FDA") ══════════════════ */

describe("PayrollPeriodFormModal · FDA yüzeyleri", () => {
  it("🔴 FDA:85-92 · “satırlar oluşmaz” uyarı kutusu BASILIR", () => {
    renderModal();
    const notice = screen.getByTestId("bordro-open-notice");
    expect(notice).toHaveTextContent(OPEN_PERIOD_NOTICE_TITLE);
    // Gövde ELLE yazılır (sabitten değil): sabiti sabite karşı çakmak
    // mutasyonu geçirirdi.
    expect(notice).toHaveTextContent(
      "Dönem açılır ama personel satırları boş kalır.",
    );
    expect(notice).toHaveTextContent("“Hesapla” düğmesine basmanız gerekir.");
    // Sabit de aynı cümleyi taşıyor olmalı — iki katman birbirini tutuyor.
    expect(OPEN_PERIOD_NOTICE_BODY).toContain("personel satırları boş kalır");
  });

  it("FDA:55 · başlık altında adım sayacı vardır", () => {
    renderModal();
    expect(screen.getByTestId("bordro-open-step")).toHaveTextContent("Adım 1 / 2");
    expect(OPEN_PERIOD_STEP).toBe("Adım 1 / 2");
  });

  it("FDA:66-69 · ay seçeneği `8 — Ağustos` biçimindedir ve boş seçenek FDA:65'tir", () => {
    renderModal();
    const month = screen.getByTestId("bordro-open-month");
    expect(month).toHaveTextContent("Ay seçiniz…");
    expect(month).toHaveTextContent("1 — Ocak");
    expect(month).toHaveTextContent("8 — Ağustos");
    expect(month).toHaveTextContent("12 — Aralık");
  });

  it("FDA:75 · yıl ipucu sözleşme sınırlarından TÜRER", () => {
    renderModal();
    expect(screen.getByText(`${MIN_PAYROLL_YEAR} – ${MAX_PAYROLL_YEAR}`)).toBeInTheDocument();
  });

  it("FDA:96 · vazgeçme düğmesinin metni `İptal`dir", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "İptal" })).toBeInTheDocument();
    expect(OPEN_PERIOD_CANCEL_LABEL).toBe("İptal");
  });

  /**
   * 🔴 FDA:82'nin ipucu cümlesi BAYATTIR (*"girilirse gösterge panelinde
   * hatırlatma çıkar"*): gösterge paneli yalnız ONAYLANMIŞ dönemleri
   * listeler, taslak dönemin vadesi orada ÇIKMAZ. İddia YAPIYA bağlanır
   * (ipucu düğümünün METNİ), yalnız "şu kelime geçmesin" negatifine değil —
   * yoksa metin değişince bekçi sessizce körelirdi.
   */
  it("🔴 son ödeme ipucu, mockup'ın BAYAT cümlesini TAŞIMAZ", () => {
    renderModal();
    const due = screen.getByTestId("bordro-open-due");
    const hintId = due.getAttribute("aria-describedby");
    expect(hintId).not.toBeNull();
    const hint = document.getElementById(hintId!);
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe(OPEN_PERIOD_DUE_HINT);
    expect(hint!.textContent).not.toMatch(/gösterge panel/i);
  });
});

describe("PayrollPeriodFormModal · SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı/öneriden dokunulmadı → false; vade tarihi girildi → true; başarılı kayıt → false (kapanış)", async () => {
    const user = userEvent.setup();
    let unmount = () => {};
    const wrappedOnClose = vi.fn(() => unmount());
    ({ unmount } = render(
      <PayrollPeriodFormModal rows={ROWS} onClose={wrappedOnClose} onCreated={onCreated} />,
    ));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByTestId("bordro-open-due"), "01.09.2026");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(screen.getByTestId("bordro-open-submit"));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});
