import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { useBankAccounts } from "@/lib/api/hooks/useBankAccounts";
import { useCreateFinancialInstrument } from "@/lib/api/hooks/useFinancialInstrumentMutations";
import { useProjects } from "@/lib/api/hooks/useProjects";

import {
  BANK_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  SERIAL_NO_MAX_LENGTH,
} from "./financial-instrument-form";
import {
  INSTRUMENT_FORM_COMPOSITION_NOTE,
  INSTRUMENT_FORM_LEAD,
  INSTRUMENT_FORM_OPTIONAL_TITLE,
  INSTRUMENT_FORM_STATUS_NOTE_BODY,
} from "./financial-instrument-labels";
import { InstrumentFormModal } from "./InstrumentFormModal";

vi.mock("@/lib/api/hooks/useFinancialInstrumentMutations", () => ({
  useCreateFinancialInstrument: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBankAccounts")>()),
  useBankAccounts: vi.fn(),
}));

/**
 * F-CEK · "Yeni Çek / Senet" diyaloğu.
 *
 * 🔴 Bu testin ASIL İŞİ **gövdeyi uçtan ölçülen şemaya sabitlemektir**
 * (`FinancialInstrumentCreate`, `additionalProperties: false`): fazladan TEK
 * bir alan bile 422 üretir ve bu YALNIZ canlıda görülürdü. Sınır DEĞERLERİ
 * ayrıca `financial-instrument-contract.test.ts`te ŞEMADAN okunarak çakılıdır.
 */

const mutateAsync = vi.fn();
const onClose = vi.fn();

function setMutation(partial: Record<string, unknown> = {}) {
  vi.mocked(useCreateFinancialInstrument).mockReturnValue({
    isPending: false,
    mutateAsync,
    ...partial,
  } as unknown as ReturnType<typeof useCreateFinancialInstrument>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ id: "fi-1" });
  setMutation();
  vi.mocked(useProjects).mockReturnValue({
    data: { items: [{ id: "p-1", name: "Güneşkent Konut" }] },
  } as unknown as ReturnType<typeof useProjects>);
  vi.mocked(useBankAccounts).mockReturnValue({
    data: {
      items: [
        { id: "ba-1", bank_name: "Ziraat", display_name: "Merkez Kasa", iban: null },
      ],
    },
  } as unknown as ReturnType<typeof useBankAccounts>);
});

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("fin-form-serial"), "0123456789");
  await user.type(screen.getByTestId("fin-form-drawer"), "Güneşkent Gayrimenkul A.Ş.");
  await user.type(screen.getByTestId("fin-form-amount"), "1200000,00");
  await user.type(screen.getByTestId("fin-form-issue"), "20.08.2026");
  await user.type(screen.getByTestId("fin-form-due"), "20.09.2026");
}

describe("FCE · mockup yüzeyleri", () => {
  it("başlık, alt satır, isteğe bağlı bölümü ve durum notu basılır", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Yeni Çek / Senet" })).toBeInTheDocument();
    expect(screen.getByTestId("fin-form-lead")).toHaveTextContent(INSTRUMENT_FORM_LEAD);
    expect(screen.getByText(INSTRUMENT_FORM_OPTIONAL_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId("fin-form-status-note")).toHaveTextContent(
      INSTRUMENT_FORM_STATUS_NOTE_BODY,
    );
  });

  /** 🔴 FCE:48 — durum alanı YOKTUR ve eklenmez (şema `forbid`). */
  it("🔴 DURUM seçici HİÇ YOKTUR", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.queryByLabelText(/durum/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Portföyde")).not.toBeInTheDocument();
  });

  it("FCE:41-45 — Tür ve Yön AYRI segmentlerdir, DÖRT bileşim de seçilebilir", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByTestId("fin-form-composition")).toHaveTextContent("ALINAN ÇEK");
    expect(screen.getByText(INSTRUMENT_FORM_COMPOSITION_NOTE)).toBeInTheDocument();

    await user.click(screen.getByTestId("fin-form-direction-issued"));
    expect(screen.getByTestId("fin-form-composition")).toHaveTextContent("VERİLEN ÇEK");

    await user.click(screen.getByTestId("fin-form-kind-promissory_note"));
    // 🔴 Dördüncü bileşim: VERİLEN SENET — birleşik tek seçim olsaydı bu
    // bileşim ifade edilemezdi.
    expect(screen.getByTestId("fin-form-composition")).toHaveTextContent("VERİLEN SENET");
    expect(screen.getByTestId("fin-form-kind-promissory_note")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("fin-form-kind-cheque")).toHaveAttribute("aria-pressed", "false");
  });

  /**
   * 🔴 Etiket SABİTTİR (FCE:129 "Çek / Senet No" — iki türü de kapsar). E10
   * TABLOSUNDAKİ türeyen başlık kuralı buraya KOPYALANMAZ: mockup'ta olmayan
   * bir davranış icat etmek olurdu.
   */
  it("seri no etiketi SABİTTİR — tür değişince DEĞİŞMEZ", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByLabelText("Çek / Senet No")).toBeInTheDocument();
    await user.click(screen.getByTestId("fin-form-kind-promissory_note"));
    expect(screen.getByLabelText("Çek / Senet No")).toBeInTheDocument();
    expect(screen.queryByLabelText("Senet No")).not.toBeInTheDocument();
  });

  /** 🔴 DENETİM SAPMASI 1 — banka SERBEST METİNDİR, kapalı liste değil. */
  it("🔴 Banka alanı SERBEST METİNDİR (`<select>` DEĞİL)", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByTestId("fin-form-bank").tagName).toBe("INPUT");
    expect(screen.getByTestId("fin-form-bank-account").tagName).toBe("SELECT");
  });

  /** 🔴 DENETİM SAPMASI 2 — açıklamanın 200 sınırı ekranda YAZILI. */
  it("🔴 her metin alanının sınırı EKRANDA yazılıdır", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByText(`Maks ${SERIAL_NO_MAX_LENGTH} karakter`)).toBeInTheDocument();
    expect(screen.getByText(`Maks ${DESCRIPTION_MAX_LENGTH} karakter`)).toBeInTheDocument();
    expect(
      screen.getByText(`Serbest metin · maks ${BANK_NAME_MAX_LENGTH} karakter`),
    ).toBeInTheDocument();
  });
});

describe("FCE · korkuluklar", () => {
  it("boş formda Kaydet KAPALIdır ve gerekçesi footer'da okunur", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(screen.getByTestId("fin-form-submit")).toBeDisabled();
    expect(screen.getByTestId("fin-form-block-reason")).toHaveTextContent(
      "Çek / Senet no zorunludur.",
    );
  });

  /** 🔴 FCE:141-147 (KARAR 4) — hata ALANIN ALTINDA, genel bantta DEĞİL. */
  it("🔴 vade keşideden önceyse hata ALANIN ALTINDA basılır ve kayıt KAPANIR", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.clear(screen.getByTestId("fin-form-due"));
    await user.type(screen.getByTestId("fin-form-due"), "10.08.2026");

    const due = screen.getByTestId("fin-form-due");
    expect(due).toHaveAttribute("aria-invalid", "true");
    const errorId = due.getAttribute("aria-describedby")!;
    expect(document.getElementById(errorId)).toHaveTextContent(
      "Vade, keşide tarihinden önce olamaz — en az 20.08.2026 olmalı",
    );
    expect(screen.getByTestId("fin-form-submit")).toBeDisabled();
    expect(screen.getByTestId("fin-form-block-reason")).toHaveTextContent(
      "Vade tarihi düzeltilmeden kaydedilemez",
    );
  });

  it("sınırı aşan seri no kaydı KAPATIR (sözleşme `maxLength`)", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.clear(screen.getByTestId("fin-form-serial"));
    await user.type(screen.getByTestId("fin-form-serial"), "x".repeat(SERIAL_NO_MAX_LENGTH + 1));
    expect(screen.getByTestId("fin-form-submit")).toBeDisabled();
  });

  it("ondalık ÖLÇEK aşımı kaydı KAPATIR (sunucu sessizce yuvarlamaz)", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.clear(screen.getByTestId("fin-form-amount"));
    await user.type(screen.getByTestId("fin-form-amount"), "0,005");
    expect(screen.getByTestId("fin-form-submit")).toBeDisabled();
  });
});

describe("FCE · gönderim", () => {
  it("🔴 gövde ŞEMANIN TAM KÜMESİDİR — boş opsiyoneller HİÇ gönderilmez", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.click(screen.getByTestId("fin-form-submit"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // 🔴 `toEqual` — `toMatchObject` fazladan bir alanı GÖRMEZDİ ve şema
    // `additionalProperties: false`tır (fazladan alan = 422).
    expect(mutateAsync).toHaveBeenCalledWith({
      instrument_kind: "cheque",
      direction: "received",
      serial_no: "0123456789",
      drawer_name: "Güneşkent Gayrimenkul A.Ş.",
      issue_date: "2026-08-20",
      due_date: "2026-09-20",
      amount: "1200000.00",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("dolu opsiyoneller gövdeye GİRER (proje · banka hesabı · banka · açıklama)", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.type(screen.getByTestId("fin-form-bank"), "Ziraat Bankası");
    await user.type(screen.getByTestId("fin-form-description"), "Hakediş #5 tahsilatı");
    await user.selectOptions(screen.getByTestId("fin-form-project"), "p-1");
    await user.selectOptions(screen.getByTestId("fin-form-bank-account"), "ba-1");
    await user.click(screen.getByTestId("fin-form-submit"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toEqual({
      instrument_kind: "cheque",
      direction: "received",
      serial_no: "0123456789",
      drawer_name: "Güneşkent Gayrimenkul A.Ş.",
      issue_date: "2026-08-20",
      due_date: "2026-09-20",
      amount: "1200000.00",
      bank_name: "Ziraat Bankası",
      description: "Hakediş #5 tahsilatı",
      project_id: "p-1",
      bank_account_id: "ba-1",
    });
  });

  it("sunucu hatası EKRANDA basılır ve diyalog KAPANMAZ", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error("sunucu patladı"));
    render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.click(screen.getByTestId("fin-form-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("fin-form-error")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("InstrumentFormModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<InstrumentFormModal onClose={onClose} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", async () => {
    const user = userEvent.setup();
    render(<InstrumentFormModal onClose={onClose} />);
    await user.type(screen.getByTestId("fin-form-serial"), "0123456789");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (onClose çağrılır, unmount) → temiz", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstrumentFormModal onClose={onClose} />);
    await fillRequired(user);
    await user.click(screen.getByTestId("fin-form-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
