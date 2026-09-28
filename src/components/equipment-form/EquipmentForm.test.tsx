import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { EquipmentForm } from "./EquipmentForm";
import {
  useEquipmentDetail,
  type EquipmentEditResponse,
} from "@/lib/api/hooks/useEquipmentDetail";
import {
  useCreateEquipment,
  useUpdateEquipment,
} from "@/lib/api/hooks/useEquipmentMutations";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSuppliers } from "@/lib/api/hooks/useSuppliers";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentMutations", () => ({
  useCreateEquipment: vi.fn(),
  useUpdateEquipment: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentDetail", () => ({ useEquipmentDetail: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useSuppliers", () => ({ useSuppliers: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));

const createMutate = vi.fn();
const updateMutate = vi.fn();

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { equipment: level } } as unknown as MeResponse,
    isLoading: false,
  });
}

/**
 * Düzenleme kipinin künyesi — K5 kapısına giren ALTI alan `null`, yani sunucu
 * bu kararların hiçbirini taşımıyor ama ekranda hepsi DOLU görünecek.
 */
const DETAIL_FIXTURE: EquipmentEditResponse = {
  id: "eq-9",
  name: "Tower Crane TC-48",
  category: "crane",
  brand: "Liebherr",
  model: "154 EC-H",
  serial_no: "LBH-2022-8842",
  plate_no: null,
  model_year: 2022,
  ownership: "owned",
  purchase_amount: "3800000.00",
  purchase_date: "2022-04-01",
  depreciation_years: null,
  supplier_id: null,
  financing: null,
  market_value: null,
  rate_amount: null,
  rate_period: null,
  site_id: "site-1",
  operator_id: null,
  status: "working",
  status_note: null,
  status_expected_date: null,
  fuel_type: null,
  norm_consumption: null,
  norm_unit: null,
  maintenance_period: null,
  monthly_capacity_hours: 200,
  engine_power_kw: null,
  capacity_description: null,
  hourmeter_hours: null,
  rental_contract_no: null,
  rental_start_date: null,
  rental_end_date: null,
  rental_min_monthly_hours: null,
  rental_payment_terms: null,
  last_service_date: null,
  last_service_hourmeter: null,
  is_company_asset: true,
  is_active: true,
  created_at: "2026-08-14T00:00:00Z",
};

function mockDetail(overrides: Partial<EquipmentEditResponse> = {}) {
  vi.mocked(useEquipmentDetail).mockReturnValue({
    data: { ...DETAIL_FIXTURE, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession("full");
  vi.mocked(useCreateEquipment).mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as never);
  vi.mocked(useUpdateEquipment).mockReturnValue({
    mutate: updateMutate,
    isPending: false,
  } as never);
  mockDetail();
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [
      { siteId: "site-1", projectId: "p-1", label: "Güneşkent A-Blok" },
      { siteId: "site-2", projectId: "p-2", label: "Çelik OSB Fabrika" },
    ],
    isLoading: false,
    isError: false,
  });
  vi.mocked(useSuppliers).mockReturnValue({
    data: { items: [{ id: "sup-1", name: "Liebherr Türkiye A.Ş." }] },
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [{ id: "per-1", full_name: "Murat Şen", trade: "Vinç Operatörü" }] },
    isLoading: false,
    isError: false,
  } as never);
});

/** Mockup'ta "Ekipmanı Kaydet" İKİ kez vardır (39 + 171); testler ALT şeridi kullanır. */
function actionButton(name: string) {
  return within(document.querySelector(".pf-actions") as HTMLElement).getByRole("button", {
    name,
  });
}

/** Oluşturma kipinin geçebilmesi için gereken çekirdek (M2'nin yıldızları). */
async function fillCore(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Ekipman Adı"), "Tower Crane TC-48");
  await user.selectOptions(screen.getByLabelText("Kategori"), "crane");
  await user.type(screen.getByLabelText("Alış Bedeli (₺)"), "3800000");
  await user.selectOptions(screen.getByLabelText("Atandığı Proje"), "site-1");
}

describe("EquipmentForm · yetki kapısı", () => {
  it("yazma yetkisi olmayan kullanıcı formu göremez", () => {
    mockSession("view");
    render(<EquipmentForm mode="create" />);
    expect(screen.queryByTestId("equipment-form-body")).not.toBeInTheDocument();
  });
});

describe("EquipmentForm (create) · mockup yapısı", () => {
  it("BEŞ kartın hepsi basılır", () => {
    render(<EquipmentForm mode="create" />);
    expect(screen.getByText("🏗 Sahiplik Tipi")).toBeInTheDocument();
    expect(screen.getByText("⚙️ Ekipman Bilgileri")).toBeInTheDocument();
    expect(screen.getByText("💰 Mali Bilgiler")).toBeInTheDocument();
    expect(screen.getByText("📍 Kullanım & Atama")).toBeInTheDocument();
    expect(screen.getByText("📎 Ekipman Belgeleri")).toBeInTheDocument();
  });

  it("M2'de taslak butonu YOK — form da basmaz (is_draft sunucuda da yok)", () => {
    render(<EquipmentForm mode="create" />);
    expect(screen.queryByRole("button", { name: /Taslak/i })).not.toBeInTheDocument();
  });

  it("K7 — Marka ve Model AYRI iki inputtur", () => {
    render(<EquipmentForm mode="create" />);
    expect(screen.getByLabelText("Marka")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });

  it("K5/MK-1 K5 — norm tüketim sayı + birim olarak İKİ kontroldür", () => {
    render(<EquipmentForm mode="create" />);
    expect(screen.getByLabelText("Norm Tüketim")).toBeInTheDocument();
    expect(screen.getByLabelText("Norm Birimi")).toBeInTheDocument();
  });

  it("belgeler kartı DEVRE-DIŞIDIR ve gerekçesi GÖRÜNÜR", () => {
    render(<EquipmentForm mode="create" />);
    expect(screen.getByTestId("makine-belge-gerekce")).toBeVisible();
  });

  it("geçerli form POST gövdesi üretir ve listeye döner", async () => {
    createMutate.mockImplementation((_body, options) => options.onSuccess?.({}));
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await fillCore(user);
    await user.click(actionButton("Ekipmanı Kaydet"));

    expect(createMutate.mock.calls[0][0]).toMatchObject({
      name: "Tower Crane TC-48",
      category: "crane",
      ownership: "owned",
      purchase_amount: "3800000",
      site_id: "site-1",
    });
    expect(push).toHaveBeenCalledWith("/makine");
  });

  it("sunucu hatası Türkçe gösterilir (yutulmaz)", async () => {
    createMutate.mockImplementation((_body, options) =>
      options.onError?.(new BackendError(422, { detail: "Alış bedeli zorunludur." })),
    );
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await fillCore(user);
    await user.click(actionButton("Ekipmanı Kaydet"));

    expect(screen.getByTestId("equipment-form-error")).toHaveTextContent(
      "Alış bedeli zorunludur.",
    );
  });
});

/**
 * 🔴 K8 — `Alış Bedeli` KOŞULLU zorunludur ve İSTEMCİDE de doğrulanır:
 * sunucu 422'si TEK savunma bırakılmaz.
 */
describe("EquipmentForm · K8 istemci doğrulaması", () => {
  it("`owned` iken boş alış bedeli gönderimi DURDURUR (sunucuya hiç gidilmez)", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await user.type(screen.getByLabelText("Ekipman Adı"), "Tower Crane");
    await user.selectOptions(screen.getByLabelText("Kategori"), "crane");
    await user.selectOptions(screen.getByLabelText("Atandığı Proje"), "site-1");
    await user.click(actionButton("Ekipmanı Kaydet"));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("equipment-form-error")).toHaveTextContent(
      "alış bedeli zorunludur",
    );
  });

  it("`rented` seçilince alış bedeli SERBESTTİR — form geçer", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await user.type(screen.getByLabelText("Ekipman Adı"), "Kiralık Loder");
    await user.selectOptions(screen.getByLabelText("Kategori"), "machinery");
    await user.selectOptions(screen.getByLabelText("Atandığı Proje"), "site-1");
    await user.click(screen.getByTestId("makine-sahiplik-rented"));
    await user.click(actionButton("Ekipmanı Kaydet"));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      ownership: "rented",
      purchase_amount: null,
    });
  });

  it("zorunluluk YILDIZI sahipliğe göre görünür/düşer (görünen = uygulanan)", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    expect(screen.getByLabelText("Alış Bedeli (₺)")).toHaveAttribute("aria-required", "true");

    await user.click(screen.getByTestId("makine-sahiplik-rented"));
    expect(screen.getByLabelText("Alış Bedeli (₺)")).not.toHaveAttribute("aria-required");
  });
});

/**
 * 🔴 K5 KAPISI — "sunucudaki `null`ı EZME".
 *
 * M2'de bu seçicilerin boş seçeneği YOKTUR: sunucuda `null` olsa bile ekranda
 * bir değer GÖRÜNÜR. Kullanıcı o seçiciyi hiç AÇMADAN kaydederse, anahtarın
 * gitmesi kullanıcının VERMEDİĞİ kararı veriye yazmak olurdu.
 * (Alan bazlı dört durumun tamamı `omit-fields.test.ts`te; buradaki testler
 * kapının FORM ucunda gerçekten bağlı olduğunu kanıtlar.)
 */
describe("EquipmentForm (edit) · dokunulmamış varsayılan seçiciler", () => {
  it("sunucuda null olan ALTI seçici DOKUNULMADAN kaydedilirse anahtarları GİTMEZ", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);

    // Ekranda mockup'ın varsayılanları GÖRÜNÜR — ama kullanıcının kararı değil.
    expect(screen.getByLabelText("Yakıt Tipi")).toHaveValue("diesel");
    expect(screen.getByLabelText("Bakım Periyodu")).toHaveValue("hours_500");
    expect(screen.getByLabelText("Amortisman Süresi (Yıl)")).toHaveValue("10");
    expect(screen.getByLabelText("Kredi ile Alındı mı?")).toHaveValue("cash");
    expect(screen.getByLabelText("Kira Tipi")).toHaveValue("hourly");
    expect(screen.getByLabelText("Norm Birimi")).toHaveValue("lt_hour");

    await user.click(actionButton("Kaydet"));

    const body = updateMutate.mock.calls[0][0];
    expect("fuel_type" in body).toBe(false);
    expect("maintenance_period" in body).toBe(false);
    expect("depreciation_years" in body).toBe(false);
    expect("financing" in body).toBe(false);
    expect("rate_period" in body).toBe(false);
    expect("norm_unit" in body).toBe(false);
    // Sunucuda DOLU olan alanlar normal gider.
    expect(body).toMatchObject({ name: "Tower Crane TC-48", brand: "Liebherr" });
  });

  it("kullanıcı Yakıt Tipi'ni SEÇERSE değer gövdede gider", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    await user.selectOptions(screen.getByLabelText("Yakıt Tipi"), "electric");
    await user.click(actionButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({ fuel_type: "electric" });
    // Dokunulmayan diğer beşi ATLANMAYA devam eder.
    expect("maintenance_period" in updateMutate.mock.calls[0][0]).toBe(false);
  });

  it("sunucudan DOLU gelen seçiciler dokunulmasa da AYNI değerle gider (gerileme koruması)", async () => {
    mockDetail({
      fuel_type: "gasoline",
      maintenance_period: "hours_1000",
      depreciation_years: 15,
      financing: "leasing",
      rate_period: "monthly",
      norm_unit: "lt_km",
    });
    const user = userEvent.setup();
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    await user.click(actionButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      fuel_type: "gasoline",
      maintenance_period: "hours_1000",
      depreciation_years: 15,
      financing: "leasing",
      rate_period: "monthly",
      norm_unit: "lt_km",
    });
  });

  it("OLUŞTURMA kipi ETKİLENMEZ — altı anahtar da HER ZAMAN gider", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await fillCore(user);
    await user.click(actionButton("Ekipmanı Kaydet"));

    expect(createMutate.mock.calls[0][0]).toMatchObject({
      fuel_type: "diesel",
      maintenance_period: "hours_500",
      depreciation_years: 10,
      financing: "cash",
      rate_period: "hourly",
      norm_unit: "lt_hour",
    });
  });
});

describe("EquipmentForm (edit) · tohumlama", () => {
  it("künyeden gelen değerler forma basılır", () => {
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    expect(screen.getByLabelText("Ekipman Adı")).toHaveValue("Tower Crane TC-48");
    expect(screen.getByLabelText("Marka")).toHaveValue("Liebherr");
    expect(screen.getByLabelText("Model")).toHaveValue("154 EC-H");
    expect(screen.getByLabelText("Atandığı Proje")).toHaveValue("site-1");
  });

  it("şantiyesiz (depodaki) ekipman “Depoda (Atanmadı)” gösterir, boş DEĞİL (K6)", () => {
    mockDetail({ site_id: null });
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    expect(screen.getByLabelText("Atandığı Proje")).toHaveValue("__depoda__");
  });

  it("“Depoda (Atanmadı)” kaydedilirse site_id null gider", async () => {
    mockDetail({ site_id: null });
    const user = userEvent.setup();
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    await user.click(actionButton("Kaydet"));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ site_id: null });
  });

  it("MK-1 K3 — iki tedarikçi kontrolü TEK durumu yazar", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    await user.selectOptions(screen.getByLabelText("Kiralama Firması"), "sup-1");
    // Aynı seçim öbür kontrolde de görünür — ikinci bir state YOK.
    expect(screen.getByLabelText("Tedarikçi / Satıcı")).toHaveValue("sup-1");

    await user.click(actionButton("Kaydet"));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ supplier_id: "sup-1" });
  });

  /**
   * M5_3 #85 — no 75 ile AYNI kusur sınıfı (form ekranındaki tekrarı):
   * bayrak yalnız `!isLoading`e bakıyordu, `useSiteOptions` hatada da
   * `isLoading=false` döndüğü için hata "yüklendi" sanılırdı.
   */
  it("siteOptionsState.isError iken YÜKLENDİ izi BASILMAZ", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    expect(screen.queryByTestId("makine-form-loaded-sites")).not.toBeInTheDocument();
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("EquipmentForm — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<EquipmentForm mode="create" />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("edit kipinde ASYNC TABAN: seed efekti dokunuş SAYILMAZ → temiz", () => {
    render(<EquipmentForm mode="edit" equipmentId="eq-9" />);
    expect(screen.getByLabelText("Ekipman Adı")).toHaveValue("Tower Crane TC-48");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", async () => {
    const user = userEvent.setup();
    render(<EquipmentForm mode="create" />);
    await fillCore(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (router.push unmount eder) → temiz", async () => {
    createMutate.mockImplementation((_body, options) => options.onSuccess?.({}));
    const user = userEvent.setup();
    const { unmount } = render(<EquipmentForm mode="create" />);
    await fillCore(user);
    await user.click(actionButton("Ekipmanı Kaydet"));
    expect(push).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
