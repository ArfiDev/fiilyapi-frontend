import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BoqAssignmentCard, CREATE_MODE_DISABLED_REASON } from "./BoqAssignmentCard";
import { useBoq } from "@/lib/api/hooks/useBoq";
import {
  fetchBoqItemAllocations,
  useReplaceBoqItemAllocations,
} from "@/lib/api/hooks/useBoqAllocations";
import type { BoqGroup } from "@/lib/api/hooks/useBoq";
import { BackendError } from "@/lib/api/unwrap";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";

vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useBoqAllocations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoqAllocations")>()),
  fetchBoqItemAllocations: vi.fn(),
  useReplaceBoqItemAllocations: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/** `boq` modülü için tekil izin seviyesi kurar — `undefined` bilinmezlik dalına düşer (varsayılan). */
function setBoqPermission(level: string | undefined) {
  vi.mocked(useSession).mockReturnValue({
    me: level === undefined ? null : ({ permissions: { boq: level } } as unknown as MeResponse),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const SECTION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SECTION_ID = "33333333-3333-4333-8333-333333333333";

/** SüzgeçSİZ yanıt: `quantity` pozun GERÇEK şantiye kotasıdır. */
const SITE_GROUPS = [
  {
    id: "bg-1",
    name: "BETONARME",
    sort_order: 10,
    group_total: "0",
    items: [
      {
        id: "bi-1",
        code: "03.001",
        description: "Kat Döşemesi Betonu C25/30",
        unit: "m³",
        quantity: "1900.000",
        unit_price: "1850.00",
        amount: "0",
        sort_order: 0,
        allocated_quantity: "1200.000",
        unallocated_quantity: "700.000",
        progress_pct: { available: false, value: null, pending_module: "progress_payments" },
      },
      {
        id: "bi-2",
        code: "03.010",
        description: "Döşeme Kalıbı",
        unit: "m²",
        quantity: "5000.000",
        unit_price: "185.00",
        amount: "0",
        sort_order: 1,
        allocated_quantity: "2880.000",
        unallocated_quantity: "2120.000",
        progress_pct: { available: false, value: null, pending_module: "progress_payments" },
      },
    ],
  },
] as unknown as BoqGroup[];

/** SüzgeçLİ yanıt: `quantity` BU BÖLÜMÜN payına maskelenmiştir (K5). */
const SECTION_GROUPS = [
  {
    ...SITE_GROUPS[0],
    items: [{ ...SITE_GROUPS[0].items[0], quantity: "480.000" }],
  },
] as unknown as BoqGroup[];

const mutateAsync = vi.fn();

function mockQueries() {
  vi.mocked(useBoq).mockImplementation(((siteId: string, sectionId?: string) => ({
    data: { groups: sectionId ? SECTION_GROUPS : SITE_GROUPS, totals: {} },
    isLoading: false,
    isError: false,
  })) as unknown as typeof useBoq);
  vi.mocked(useReplaceBoqItemAllocations).mockReturnValue({
    mutateAsync,
  } as unknown as ReturnType<typeof useReplaceBoqItemAllocations>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({});
  mockQueries();
  setBoqPermission(undefined);
});

function renderEdit() {
  return render(
    <BoqAssignmentCard mode="edit" siteId={SITE_ID} sectionId={SECTION_ID} canWrite />,
  );
}

describe("oluşturma kipi — GÖRÜNÜR gerekçeyle devre dışı", () => {
  it("kontroller devre dışıdır ve gerekçe EKRANDA basılır (title'da saklanmaz)", () => {
    render(<BoqAssignmentCard mode="create" />);
    expect(screen.getByRole("button", { name: "+ Poz Seç" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Şantiye kotasından poz seç" })).toBeDisabled();
    expect(screen.getByText(CREATE_MODE_DISABLED_REASON)).toBeInTheDocument();
  });

  it("kart mockup yerleşimini KORUR — kontroller silinmez", () => {
    render(<BoqAssignmentCard mode="create" />);
    expect(screen.getByText("📋 Bölüme Atanacak İş Kalemleri")).toBeInTheDocument();
    expect(screen.getByText("BÖLÜM İŞ KALEMİ TOPLAMI")).toBeInTheDocument();
  });
});

describe("düzenleme kipi — İKİ YANITTAN doğru sayı", () => {
  // 🔴 BOQ-SEC K2 iki anlam tuzağı: "Şantiye Kotası" sütunu süzgeçli yanıtın
  // `quantity`sinden okunsaydı 480 basardı (bölümün payı) — sessizce yanlış.
  it("Şantiye Kotası GERÇEK kotadır (allocated + unallocated), bölüm payı DEĞİL", () => {
    renderEdit();
    const row = screen.getByText("Kat Döşemesi Betonu C25/30").closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("1.900");
    expect(screen.getByLabelText("03.001 için bu bölüme atanan miktar")).toHaveValue("480.000");
  });

  it("bu bölüme payı OLMAYAN poz karta dökülmez (kart katalog değildir)", () => {
    renderEdit();
    expect(screen.queryByText("Döşeme Kalıbı")).not.toBeInTheDocument();
  });
});

describe("🔴 KAYDETME — ÖBÜR BÖLÜMLERİN PAYLARI KORUNUR", () => {
  it("gövdeye öbür bölümün payı da konur (tam küme değiştirme)", async () => {
    vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
      item: SITE_GROUPS[0].items[0],
      allocations: [
        { section_id: SECTION_ID, section_name: "Kat 11-14", quantity: "480.000" },
        { section_id: OTHER_SECTION_ID, section_name: "Kat 1-10", quantity: "720.000" },
      ],
    } as never);

    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [vars] = mutateAsync.mock.calls[0] as [{ itemId: string; allocations: unknown[] }];
    expect(vars.itemId).toBe("bi-1");
    // Karşıt kanıt: ÖBÜR bölüm gövdede DURUYOR. Durmasaydı istek 200 döner ve
    // 720 m³'lük pay sessizce silinirdi.
    expect(vars.allocations).toContainEqual({
      section_id: OTHER_SECTION_ID,
      quantity: "720.000",
    });
    expect(vars.allocations).toContainEqual({ section_id: SECTION_ID, quantity: "500" });
  });

  it("kaydetmeden ÖNCE kümenin tamamı TAZE okunur (önbellekten değil)", async () => {
    vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
      item: SITE_GROUPS[0].items[0],
      allocations: [{ section_id: SECTION_ID, section_name: "x", quantity: "480.000" }],
    } as never);
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));
    await waitFor(() => expect(fetchBoqItemAllocations).toHaveBeenCalledWith("bi-1"));
  });

  it("× ile çıkarılan satır gövdeden DÜŞER — sıfır YAZILMAZ (gt=0)", async () => {
    vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
      item: SITE_GROUPS[0].items[0],
      allocations: [
        { section_id: SECTION_ID, section_name: "x", quantity: "480.000" },
        { section_id: OTHER_SECTION_ID, section_name: "y", quantity: "720.000" },
      ],
    } as never);
    const user = userEvent.setup();
    renderEdit();
    await user.click(
      screen.getByRole("button", { name: "03.001 pozunu bu bölümden çıkar" }),
    );
    await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [vars] = mutateAsync.mock.calls[0] as [{ allocations: Array<{ section_id: string }> }];
    expect(vars.allocations.some((a) => a.section_id === SECTION_ID)).toBe(false);
    expect(vars.allocations).toContainEqual({
      section_id: OTHER_SECTION_ID,
      quantity: "720.000",
    });
  });

  // 🔴 Sunucunun 409 GÖVDESİ aynen basılmalı. Genel bir "hata oluştu" mesajı,
  // kullanıcının hangi pozu neden yazamadığını gizlerdi.
  it("sunucunun 409 gövdesi AYNEN basılır — yutulmaz, uydurulmaz", async () => {
    vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
      item: SITE_GROUPS[0].items[0],
      allocations: [],
    } as never);
    mutateAsync.mockRejectedValue(
      new BackendError(409, { detail: "Bölümlere dağıtılan miktar poz miktarını aşamaz" }),
    );
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));
    await waitFor(() =>
      expect(
        screen.getByText(/Bölümlere dağıtılan miktar poz miktarını aşamaz/),
      ).toBeInTheDocument(),
    );
    // Poz KODU da basılır: birden çok kalem kaydedilirken hangisinin
    // reddedildiği görünür kalmalı.
    expect(screen.getByText(/03\.001: Bölümlere dağıtılan/)).toBeInTheDocument();
  });
});

describe("aşım kullanıcıya GÖRÜNÜR kılınır", () => {
  it("kalan kotayı aşan miktar satırda uyarı basar ve input aria-invalid olur", async () => {
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    // kota 1900, öbür bölümler 1200-480=720 → bu bölüm en fazla 1180 yazabilir
    await user.clear(input);
    await user.type(input, "1200");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Kalan kotayı/)).toBeInTheDocument();
  });

  it("kendi payını sınıra kadar büyütmek uyarı VERMEZ (karşıt kanıt)", async () => {
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "1180");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Kalan kotayı/)).not.toBeInTheDocument();
  });
});

describe("yazma yetkisi olmayan kullanıcı", () => {
  it("kontroller devre dışıdır", () => {
    render(
      <BoqAssignmentCard mode="edit" siteId={SITE_ID} sectionId={SECTION_ID} canWrite={false} />,
    );
    expect(screen.getByRole("button", { name: "+ Poz Seç" })).toBeDisabled();
    expect(screen.getByLabelText("03.001 için bu bölüme atanan miktar")).toBeDisabled();
  });
});

// M5_1 kayıt #262: `sites:full` + `boq:view` bileşimi eskiden canAssign=true
// görüyordu (yalnız `sites` modülünün canWrite'ına bakılıyordu) ve backend
// `PUT /boq/items/{id}/allocations` 403 dönerdi — `boq` modülü `full`
// eşiğinin ALTINDAYKEN kontroller de devre dışı kalmalı.
describe("sites:full ama boq:view (backend full eşiği karşılanmıyor)", () => {
  it("canWrite=true olsa bile kontroller devre dışıdır", () => {
    setBoqPermission("view");
    render(
      <BoqAssignmentCard mode="edit" siteId={SITE_ID} sectionId={SECTION_ID} canWrite />,
    );
    expect(screen.getByRole("button", { name: "+ Poz Seç" })).toBeDisabled();
    expect(screen.getByLabelText("03.001 için bu bölüme atanan miktar")).toBeDisabled();
  });

  it("boq:full ise kontroller AÇIKTIR (karşıt kanıt)", () => {
    setBoqPermission("full");
    render(
      <BoqAssignmentCard mode="edit" siteId={SITE_ID} sectionId={SECTION_ID} canWrite />,
    );
    expect(screen.getByRole("button", { name: "+ Poz Seç" })).not.toBeDisabled();
    expect(screen.getByLabelText("03.001 için bu bölüme atanan miktar")).not.toBeDisabled();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi (yalnız `edit`/`LiveCard` dalı). */
describe("BoqAssignmentCard — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    renderEdit();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("taslak miktar girildi → kirli", async () => {
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "500");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (taslak sıfırlanır) → temiz", async () => {
    vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
      item: SITE_GROUPS[0].items[0],
      allocations: [{ section_id: SECTION_ID, section_name: "Kat 11-14", quantity: "480.000" }],
    } as never);
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "500");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

// SZK-F2 — BOQ tahsis girişi de Numeric(14,3) sınırına tabidir (SZK-B1:
// BoqItemAllocationInput 1e30 → 500 kusuru). Aşan giriş GÖRÜNÜR hata verir,
// istek (okuma da yazma da) atılmaz.
describe("hane sınırı (11 tam + 3 ondalık)", () => {
  const DIGIT_MESSAGE = "En çok 11 tam ve 3 ondalık hane girilebilir.";

  it.each(["123456789012", "0.0004"])(
    "'%s' girişinde görünür hata basılır ve replace çağrılmaz",
    async (typed) => {
      const user = userEvent.setup();
      renderEdit();
      const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
      await user.clear(input);
      await user.type(input, typed);
      expect(input).toHaveAttribute("aria-invalid", "true");
      await user.click(screen.getByRole("button", { name: "Atamaları Kaydet" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(DIGIT_MESSAGE));
      expect(screen.getByRole("alert")).toHaveTextContent("03.001");
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(fetchBoqItemAllocations).not.toHaveBeenCalled();
    },
  );

  it("sınırdaki değer (11 tam + 3 ondalık) hata vermez (karşıt kanıt)", async () => {
    const user = userEvent.setup();
    renderEdit();
    const input = screen.getByLabelText("03.001 için bu bölüme atanan miktar");
    await user.clear(input);
    await user.type(input, "1.123");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(DIGIT_MESSAGE)).not.toBeInTheDocument();
  });
});
