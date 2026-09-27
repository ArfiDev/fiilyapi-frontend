import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NAME_PART_MAX_LENGTH } from "./constants";
import { PersonnelForm, safeReturnTo } from "./PersonnelForm";
import { useCreatePersonnel, useUpdatePersonnel } from "@/lib/api/hooks/usePersonnelMutations";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnelMutations", () => ({
  useCreatePersonnel: vi.fn(),
  useUpdatePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePersonnelDetail", () => ({ usePersonnelDetail: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));

const createMutate = vi.fn();
const updateMutate = vi.fn();

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { personnel: level } } as unknown as MeResponse,
    isLoading: false,
  });
}

/** YAYINLANMIŞ (is_draft:false) mevcut kayıt — düzenleme kipinin varsayılanı. */
const DETAIL_FIXTURE = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-9",
  full_name: "Mehmet Yılmaz",
  trade: "Elektrikçi",
  source: "subcontractor" as const,
  subcontractor_id: "sub-1",
  user_id: null,
  is_active: true,
  tc_no: "12345678901",
  phone: "0532 111 22 33",
  hire_date: "2026-01-15",
  assigned_project_id: "p-1",
  // "Bölüm" formdan seçilemez; kaydın mevcut değeri PATCH'te KORUNUR.
  assigned_section_id: "sec-1",
  is_draft: false,
};

function mockDetail(overrides: Partial<typeof DETAIL_FIXTURE> = {}) {
  vi.mocked(usePersonnelDetail).mockReturnValue({
    data: { ...DETAIL_FIXTURE, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  mockSession("full");
  vi.mocked(useCreatePersonnel).mockReturnValue({ mutate: createMutate, isPending: false } as never);
  vi.mocked(useUpdatePersonnel).mockReturnValue({ mutate: updateMutate, isPending: false } as never);
  mockDetail();
  vi.mocked(useSubcontractors).mockReturnValue({
    data: {
      items: [
        { id: "sub-1", name: "Aydın Elektrik Taah." },
        { id: "sub-2", name: "Çelik İnşaat Taah." },
      ],
    },
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(useProjects).mockReturnValue({
    data: {
      items: [
        { id: "p-1", name: "Güneşkent A-Blok" },
        { id: "p-2", name: "Çelik OSB Fabrika" },
      ],
    },
    isLoading: false,
    isError: false,
  } as never);
});

/**
 * Mockup'ta "Personeli Kaydet" İKİ kez vardır (üst şerit 40 + alt şerit 212);
 * ikisi de aynı gönderimi tetikler. Testler alt şeridi kullanır.
 */
function actionButton(name: string) {
  return within(document.querySelector(".pf-actions") as HTMLElement).getByRole("button", {
    name,
  });
}

function submitButton(name = "Personeli Kaydet") {
  return actionButton(name);
}

/** Mockup 63/64/91/99 — taslak yolunun yettiği çekirdek. */
async function fillCore(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Ad"), "Mehmet");
  await user.type(screen.getByLabelText("Soyad"), "Yılmaz");
  await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "company");
  await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Elektrikçi");
}

/** Mockup'ta `*` taşıyan TÜM alanlar — yayın yolunun gerektirdiği küme. */
async function fillPublishable(user: ReturnType<typeof userEvent.setup>) {
  await fillCore(user);
  await user.type(screen.getByLabelText("TC Kimlik No"), "12345678901");
  await user.type(screen.getByLabelText("Doğum Tarihi"), "12.04.1985");
  await user.type(screen.getByLabelText("Cep Telefonu"), "0532 123 45 67");
  await user.type(screen.getByLabelText("Adres"), "Cumhuriyet Mah. 12/3");
  await user.type(screen.getByLabelText("Acil Durum Kişisi"), "Ayşe Yılmaz");
  await user.type(screen.getByLabelText("Acil Durum Telefonu"), "0533 987 65 43");
  await user.type(screen.getByLabelText("İşe Giriş Tarihi"), "01.08.2026");
  await user.selectOptions(screen.getByLabelText("Atandığı Proje"), "p-1");
  await user.type(screen.getByLabelText("Ücret Tutarı (₺)"), "1200");
}

describe("PersonnelForm (create) · mockup sadakati", () => {
  it("baslik, alt baslik ve dort kart basilir (47, 48, 52, 75, 87, 123)", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByRole("heading", { level: 1, name: "Yeni Personel Kaydı" })).toBeVisible();
    expect(screen.getByText(/SGK bildirimi otomatik oluşturulur/)).toBeVisible();
    expect(screen.getByText("👤 Kimlik Bilgileri")).toBeVisible();
    expect(screen.getByText("📞 İletişim Bilgileri")).toBeVisible();
    expect(screen.getByText("💼 İş Bilgileri")).toBeVisible();
    expect(screen.getByText("📎 Belgeler")).toBeVisible();
  });

  it("İnsan Kaynakları kırıntısı GERÇEK linktir (/personel — kapsam C)", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByRole("link", { name: "İnsan Kaynakları" })).toHaveAttribute(
      "href",
      "/personel",
    );
  });

  it("mockup'taki TUM alanlar basilir — hicbiri silinmez", () => {
    render(<PersonnelForm mode="create" />);
    for (const label of [
      "Ad",
      "Soyad",
      "TC Kimlik No",
      "Doğum Tarihi",
      "Cinsiyet",
      "Medeni Durum",
      "Cep Telefonu",
      "E-posta",
      "Adres",
      "Acil Durum Kişisi",
      "Acil Durum Telefonu",
      "Çalışan Tipi",
      "Bağlı Taşeron",
      "Meslek / Görev",
      "İşe Giriş Tarihi",
      "Atandığı Proje",
      "Bölüm",
      "Ücret Tipi",
      "Ücret Tutarı (₺)",
      "Ödeme Şekli",
      "IBAN",
      "SGK Sicil No",
    ]) {
      expect(screen.getByLabelText(label), `${label} basılmadı`).toBeInTheDocument();
    }
  });

  it("meslek secenekleri mockup'in SEKIZI, sirasi korunmus (99)", () => {
    render(<PersonnelForm mode="create" />);
    const options = within(screen.getByLabelText("Meslek / Görev"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Seçiniz...",
      "Kalıpçı Usta",
      "Demir Ustası",
      "Elektrikçi",
      "Sıhhi Tesisatçı",
      "Vinç Operatörü",
      "Şantiye Şefi",
      "Büro Personeli",
      "Amele / Yardımcı",
    ]);
  });

  it("ücret tipi ve ödeme şekli mockup'taki ETİKETLERİ basar (Seçiniz YOK)", () => {
    render(<PersonnelForm mode="create" />);
    expect(
      within(screen.getByLabelText("Ücret Tipi"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Günlük", "Aylık", "Saatlik"]);
    expect(
      within(screen.getByLabelText("Ödeme Şekli"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Banka Havalesi", "Elden (Nakit)", "Karma"]);
  });

  it("cinsiyet/medeni durum ETİKETİ mockup'tan, DEĞERİ sözleşmedendir", () => {
    render(<PersonnelForm mode="create" />);
    const gender = within(screen.getByLabelText("Cinsiyet")).getAllByRole("option");
    expect(gender.map((option) => option.textContent)).toEqual(["Seçiniz...", "Erkek", "Kadın"]);
    expect(gender.map((option) => (option as HTMLOptionElement).value)).toEqual([
      "",
      "male",
      "female",
    ]);
  });

  it("Atandığı Proje mockup'ın SABİT adlarını değil GERÇEK projeleri listeler (104)", () => {
    render(<PersonnelForm mode="create" />);
    expect(
      within(screen.getByLabelText("Atandığı Proje"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Seçiniz...", "Güneşkent A-Blok", "Çelik OSB Fabrika"]);
  });

  it("TC Kimlik No mockup'in maxlength=11 degerini korur (65)", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByLabelText("TC Kimlik No")).toHaveAttribute("maxlength", "11");
  });

  it("sözleşmedeki uzunluk tavanları DOM'da uygulanır (sessiz 422 kapısı)", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByLabelText("Cep Telefonu")).toHaveAttribute("maxlength", "30");
    expect(screen.getByLabelText("E-posta")).toHaveAttribute("maxlength", "255");
    expect(screen.getByLabelText("IBAN")).toHaveAttribute("maxlength", "34");
    expect(screen.getByLabelText("SGK Sicil No")).toHaveAttribute("maxlength", "20");
    // Adres sözleşmede SINIRSIZDIR — uydurma tavan konmaz.
    expect(screen.getByLabelText("Adres")).not.toHaveAttribute("maxlength");
  });

  it("Ad/Soyad sunucu sinirini DOM'da uygular — uzun giris KIRPILIR (422 olmaz)", async () => {
    render(<PersonnelForm mode="create" />);
    const name = screen.getByLabelText("Ad", { exact: true });
    const surname = screen.getByLabelText("Soyad");
    expect(name).toHaveAttribute("maxlength", String(NAME_PART_MAX_LENGTH));
    expect(surname).toHaveAttribute("maxlength", String(NAME_PART_MAX_LENGTH));

    await userEvent.type(name, "a".repeat(NAME_PART_MAX_LENGTH + 10));
    expect((name as HTMLInputElement).value).toHaveLength(NAME_PART_MAX_LENGTH);
  });

  it("düzenleme kipine özgü 'Aktif personel' kutucuğu CREATE'te basılmaz", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.queryByLabelText("Aktif personel")).not.toBeInTheDocument();
  });
});

describe("PersonnelForm (create) · pending yüzeyler", () => {
  it("İK alanlarının HEPSİ artık ETKİN", () => {
    render(<PersonnelForm mode="create" />);
    for (const label of [
      "Ad",
      "Soyad",
      "TC Kimlik No",
      "Doğum Tarihi",
      "Cinsiyet",
      "Medeni Durum",
      "Cep Telefonu",
      "E-posta",
      "Adres",
      "Acil Durum Kişisi",
      "Acil Durum Telefonu",
      "Çalışan Tipi",
      "Meslek / Görev",
      "İşe Giriş Tarihi",
      "Atandığı Proje",
      "Ücret Tipi",
      "Ücret Tutarı (₺)",
      "Ödeme Şekli",
      "IBAN",
      "SGK Sicil No",
    ]) {
      expect(screen.getByLabelText(label), `${label} devre dışı`).toBeEnabled();
    }
  });

  it("PENDING kalan TEK alan Bölüm'dür ve gerekçesi GÖRÜNÜR yazar", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByLabelText("Bölüm")).toBeDisabled();
    expect(screen.getByText(/Bölümler şantiyeye bağlıdır/)).toBeVisible();
  });

  it("gerekceler GORUNUR listede yazar — title'da saklanmaz", () => {
    render(<PersonnelForm mode="create" />);
    const notices = screen.getByTestId("personnel-form-notices");
    expect(notices).toHaveTextContent(/belge modülünün form eklentisi sonraki dilimde gelir/);
    expect(notices).toHaveTextContent(/Bölüm/);
    expect(notices).toHaveTextContent(/Taslak Kaydet/);
  });

  // M5_1 kayıt #178: "Belge Takibi" bağlantısı ARTIK ETKİN — genel BT
  // ekranına (/personel/belgeler) gider, edilgen basılmaz.
  it("belge kartındaki 'Belge Takibi' bağlantısı GERÇEK rotaya gider", () => {
    render(<PersonnelForm mode="create" />);
    const link = screen.getByRole("link", { name: "Belge Takibi" });
    expect(link).toHaveAttribute("href", "/personel/belgeler");
  });

  // M5_1 kayıt #397: backend `WorkerSource` enum'u `freelance`/`intern`
  // üyelerini taşıyor (ölçüldü) — dördü de artık SEÇİLEBİLİR.
  it("mockup'ın dört çalışan tipi de BASILIR ve SEÇİLEBİLİR (91)", () => {
    render(<PersonnelForm mode="create" />);
    const options = within(screen.getByLabelText("Çalışan Tipi")).getAllByRole("option");
    const byLabel = new Map(options.map((option) => [option.textContent, option]));
    expect([...byLabel.keys()]).toEqual([
      "Seçiniz...",
      "Şirket Kadrosu (4a)",
      "Taşeron İşçisi",
      "Serbest Meslek",
      "Stajyer",
    ]);
    expect(byLabel.get("Şirket Kadrosu (4a)")).toBeEnabled();
    expect(byLabel.get("Taşeron İşçisi")).toBeEnabled();
    expect(byLabel.get("Serbest Meslek")).toBeEnabled();
    expect(byLabel.get("Stajyer")).toBeEnabled();
  });

  it("SGK kutucugu devre disi VE isaretsizdir (206)", () => {
    render(<PersonnelForm mode="create" />);
    const checkbox = screen.getByLabelText(/SGK işe giriş bildirgesi/);
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });
});

describe("PersonnelForm (create) · Bağlı Taşeron", () => {
  it("varsayilanda devre disidir ve gerekcesi GORUNUR yazar", () => {
    render(<PersonnelForm mode="create" />);
    expect(screen.getByLabelText("Bağlı Taşeron")).toBeDisabled();
    expect(screen.getByText(/yalnız “Taşeron İşçisi” seçildiğinde girilir/)).toBeVisible();
  });

  it("Taseron Iscisi secilince acilir ve GERCEK veriyi listeler (mockup sabitleri DEGIL)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "subcontractor");

    const select = screen.getByLabelText("Bağlı Taşeron");
    expect(select).toBeEnabled();
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["— (Şirket kadrosu)", "Aydın Elektrik Taah.", "Çelik İnşaat Taah."]);
  });
});

describe("PersonnelForm (create) · taslak / yayın ayrımı (K4)", () => {
  it("YAYIN yolunda mockup'ın YILDIZLI alanları denetlenir", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.click(submitButton());

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getAllByText("Ad zorunludur.").length).toBeGreaterThan(0);
    expect(screen.getByText("TC kimlik no zorunludur.")).toBeVisible();
    expect(screen.getByText("Doğum tarihi zorunludur.")).toBeVisible();
    expect(screen.getByText("Adres zorunludur.")).toBeVisible();
    expect(screen.getByText("İşe giriş tarihi zorunludur.")).toBeVisible();
    expect(screen.getByText("Ücret tutarı zorunludur.")).toBeVisible();
  });

  it("TASLAK yolunda sunucunun gerçekten istediği İKİ alan yeter", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.type(screen.getByLabelText("Ad"), "Zeki");
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "company");
    await user.click(actionButton("Taslak Kaydet"));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      full_name: "Zeki",
      source: "company",
      is_draft: true,
      tc_no: null,
    });
  });

  it("TASLAK yolu da boş formu geçirmez (sunucu full_name+source ister)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.click(actionButton("Taslak Kaydet"));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getAllByText("Ad zorunludur.").length).toBeGreaterThan(0);
    expect(screen.getByText("Çalışan tipi seçiniz.")).toBeVisible();
    // Taslakta yıldızlı alanlar için hata ÜRETİLMEZ.
    expect(screen.queryByText("TC kimlik no zorunludur.")).not.toBeInTheDocument();
  });

  it("yayın yolunda gövde is_draft:false ve TÜM İK alanlarıyla gider", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await fillPublishable(user);
    await user.click(submitButton());

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({
      full_name: "Mehmet Yılmaz",
      trade: "Elektrikçi",
      source: "company",
      is_active: true,
      is_draft: false,
      tc_no: "12345678901",
      birth_date: "1985-04-12",
      gender: null,
      marital_status: null,
      phone: "0532 123 45 67",
      email: null,
      address: "Cumhuriyet Mah. 12/3",
      emergency_contact_name: "Ayşe Yılmaz",
      emergency_contact_phone: "0533 987 65 43",
      hire_date: "2026-08-01",
      wage_type: "daily",
      wage_amount: "1200",
      payment_method: "bank",
      iban: null,
      sgk_no: null,
      assigned_project_id: "p-1",
    });
  });

  it("proje listesi boşsa 'Atandığı Proje' yayın yolunu KİLİTLEMEZ", async () => {
    vi.mocked(useProjects).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: true,
    } as never);
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await fillCore(user);
    await user.type(screen.getByLabelText("TC Kimlik No"), "12345678901");
    await user.type(screen.getByLabelText("Doğum Tarihi"), "12.04.1985");
    await user.type(screen.getByLabelText("Cep Telefonu"), "0532 123 45 67");
    await user.type(screen.getByLabelText("Adres"), "Cumhuriyet Mah. 12/3");
    await user.type(screen.getByLabelText("Acil Durum Kişisi"), "Ayşe Yılmaz");
    await user.type(screen.getByLabelText("Acil Durum Telefonu"), "0533 987 65 43");
    await user.type(screen.getByLabelText("İşe Giriş Tarihi"), "01.08.2026");
    await user.type(screen.getByLabelText("Ücret Tutarı (₺)"), "1200");
    await user.click(submitButton());

    expect(screen.getByText(/Proje listesi yüklenemedi/)).toBeVisible();
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({ assigned_project_id: null });
  });
});

describe("PersonnelForm (create) · gönderim", () => {
  it("taserondan sirket kadrosuna donulunce secim TEMIZLENIR (govdeye sizmaz)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.type(screen.getByLabelText("Ad"), "Ali");
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "subcontractor");
    await user.selectOptions(screen.getByLabelText("Bağlı Taşeron"), "sub-1");
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "company");
    await user.click(actionButton("Taslak Kaydet"));

    expect(createMutate.mock.calls[0][0]).not.toHaveProperty("subcontractor_id");
  });

  it("kayit basarili olunca gelinen ekrana doner", async () => {
    searchParams = new URLSearchParams({ donus: "/projeler/p-1/santiyeler/s-1/puantaj?year=2026" });
    createMutate.mockImplementation((_body, options) => options.onSuccess?.({}));
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await fillPublishable(user);
    await user.click(submitButton());

    expect(push).toHaveBeenCalledWith("/projeler/p-1/santiyeler/s-1/puantaj?year=2026");
  });

  it("Iptal donus rotasina gider; parametre yoksa genel puantaja duser", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.click(screen.getAllByRole("button", { name: "İptal" })[0]);
    expect(push).toHaveBeenCalledWith("/puantaj");
  });

  it("personnel yetkisi olmayan AccessDenied gorur", () => {
    mockSession("none");
    render(<PersonnelForm mode="create" />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("view seviyesi de yetmez (form yalnizca full+ icin)", () => {
    mockSession("view");
    render(<PersonnelForm mode="create" />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

/**
 * 🔒 spec K3 — sunucu reddi AYRIŞTIRILIR: 422 "geçersiz", 409 "çift kayıt".
 * İstemci TCKN checksum HESAPLAMAZ; ayrım yalnız yanıt kodundan gelir.
 */
describe("PersonnelForm · TCKN hata ayrımı (422 ↔ 409)", () => {
  async function submitWithError(error: BackendError) {
    createMutate.mockImplementation((_body, options) => options.onError?.(error));
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await fillPublishable(user);
    await user.click(submitButton());
    return screen.getByTestId("personnel-form-error").textContent ?? "";
  }

  it("422 GEÇERSİZLİK mesajı gösterir (sunucu detayı yutulmaz)", async () => {
    const message = await submitWithError(
      new BackendError(422, { detail: "TC kimlik numarası geçersiz" }),
    );
    expect(message).toContain("Geçersiz bilgi");
    expect(message).toContain("TC kimlik numarası geçersiz");
    expect(message).not.toContain("Çift kayıt");
  });

  it("409 ÇİFT KAYIT mesajı gösterir ve TC alanının altını da işaretler", async () => {
    const message = await submitWithError(
      new BackendError(409, { detail: "Bu TC ile personel mevcut" }),
    );
    expect(message).toContain("Çift kayıt");
    expect(message).not.toContain("Geçersiz bilgi");
    expect(screen.getByText("Bu TC kimlik no ile kayıtlı personel zaten var.")).toBeVisible();
  });

  it("422 TC alanına çift kayıt hatası BASMAZ (iki durum karışmaz)", async () => {
    await submitWithError(new BackendError(422, { detail: "tc_no geçersiz" }));
    expect(
      screen.queryByText("Bu TC kimlik no ile kayıtlı personel zaten var."),
    ).not.toBeInTheDocument();
  });
});

describe("safeReturnTo", () => {
  it("uygulama ici mutlak yolu gecirir", () => {
    expect(safeReturnTo("/puantaj?site=s-1")).toBe("/puantaj?site=s-1");
  });

  it("dis adresi ve protokol-bagimsiz yolu REDDEDER", () => {
    expect(safeReturnTo("https://evil.example/x")).toBe("/puantaj");
    expect(safeReturnTo("//evil.example")).toBe("/puantaj");
    expect(safeReturnTo(null)).toBe("/puantaj");
  });
});

/* ── F-PT2 T3 + F-İK T4 · Düzenleme kipi ───────────────────────────────── */

describe("PersonnelForm (edit) · önyükleme + mockup sadakati", () => {
  it("başlık/gönder etiketi düzenleme kipine göre değişir", () => {
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByRole("heading", { level: 1, name: "Personeli Düzenle" })).toBeVisible();
    expect(submitButton("Kaydet")).toBeInTheDocument();
  });

  it("mevcut değerler forma ÖNYÜKLENİR (İK alanları dâhil)", () => {
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("Ad")).toHaveValue("Mehmet");
    expect(screen.getByLabelText("Soyad")).toHaveValue("Yılmaz");
    expect(screen.getByLabelText("Çalışan Tipi")).toHaveValue("subcontractor");
    expect(screen.getByLabelText("Bağlı Taşeron")).toHaveValue("sub-1");
    expect(screen.getByLabelText("Meslek / Görev")).toHaveValue("Elektrikçi");
    expect(screen.getByLabelText("TC Kimlik No")).toHaveValue("12345678901");
    expect(screen.getByLabelText("Cep Telefonu")).toHaveValue("0532 111 22 33");
    expect(screen.getByLabelText("İşe Giriş Tarihi")).toHaveValue("15.01.2026");
    expect(screen.getByLabelText("Atandığı Proje")).toHaveValue("p-1");
  });

  it("'Aktif personel' kutucuğu basılır, mevcut değeri taşır ve DÜZENLENEBİLİR", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    const toggle = screen.getByLabelText("Aktif personel");
    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it("Bölüm düzenleme kipinde de PENDING kalır", () => {
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("Bölüm")).toBeDisabled();
  });

  // M5_1 kayıt #397: düzenleme kipinde de dördü SEÇİLEBİLİR olmalı.
  it("Çalışan Tipi düzenleme kipinde de dört seçenek SEÇİLEBİLİR", () => {
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    const options = within(screen.getByLabelText("Çalışan Tipi")).getAllByRole("option");
    const byLabel = new Map(options.map((option) => [option.textContent, option]));
    expect(byLabel.get("Serbest Meslek")).toBeEnabled();
    expect(byLabel.get("Stajyer")).toBeEnabled();
  });

  it("yükleniyor durumunda formu basmaz", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByText("Yükleniyor…")).toBeVisible();
    expect(screen.queryByLabelText("Ad")).not.toBeInTheDocument();
  });

  it("bulunamayan personel için hata mesajı gösterir", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(404, { detail: "personel yok" }),
    } as never);
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByText("Personel yüklenemedi")).toBeVisible();
  });

  it("403 AccessDenied gösterir", () => {
    vi.mocked(usePersonnelDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, { detail: "yetkisiz" }),
    } as never);
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("PersonnelForm (edit) · yayın durumu (K4)", () => {
  it("YAYINDAKİ eksik kayıt DÜZENLENEBİLİR — yıldız denetimi yayın geçişine özgüdür", async () => {
    // İK alanları sunucuya sonradan eklendi: eski yayınlanmış kayıtların
    // çoğunda boşlar. Düzenlemede yıldız denetimi uygulansaydı kullanıcı
    // yalnız mesleği düzeltmek isterken ekranda KİLİTLENİRDİ.
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("Adres")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Sıhhi Tesisatçı");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Adres zorunludur.")).not.toBeInTheDocument();
  });

  it("YAYINDAKİ kaydı düzenlemek onu taslağa DÜŞÜRMEZ — is_draft anahtarı gitmez", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Sıhhi Tesisatçı");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect("is_draft" in updateMutate.mock.calls[0][0]).toBe(false);
  });

  it("YAYINDAKİ kayıtta 'Taslak Kaydet' devre dışıdır ve gerekçesini taşır", () => {
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    const draft = actionButton("Taslak Kaydet");
    expect(draft).toBeDisabled();
    expect(draft).toHaveAttribute(
      "title",
      "Yayınlanmış personel kaydı formdan taslağa geri döndürülmez",
    );
    expect(screen.getByTestId("personnel-form-notices")).toHaveTextContent(/Bu kayıt YAYINDA/);
  });

  it("TASLAK kaydın birincil eylemi 'Yayına Al'dır ve is_draft:false gönderir", async () => {
    mockDetail({ is_draft: true });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByTestId("personnel-form-notices")).toHaveTextContent(/Bu kayıt TASLAK/);

    // Yayın yolu yıldızlı alanları ister — taslak kayıt eksiktir, önce reddedilir.
    await user.click(submitButton("Yayına Al"));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Adres zorunludur.")).toBeVisible();

    await user.type(screen.getByLabelText("Doğum Tarihi"), "12.04.1985");
    await user.type(screen.getByLabelText("Adres"), "Cumhuriyet Mah. 12/3");
    await user.type(screen.getByLabelText("Acil Durum Kişisi"), "Ayşe Yılmaz");
    await user.type(screen.getByLabelText("Acil Durum Telefonu"), "0533 987 65 43");
    await user.type(screen.getByLabelText("Ücret Tutarı (₺)"), "1200");
    await user.click(submitButton("Yayına Al"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ is_draft: false });
  });

  it("TASLAK kayıt taslak kalarak da kaydedilebilir (is_draft:true)", async () => {
    mockDetail({ is_draft: true });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.click(actionButton("Taslak Kaydet"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ is_draft: true });
  });
});

/**
 * 🔒 SESSİZ VERİ DEĞİŞİKLİĞİ KAPISI — varsayılanı olan seçiciler.
 *
 * "Ücret Tipi" ve "Ödeme Şekli" mockup'ta boş seçenek TAŞIMAZ: sunucuda `null`
 * olsa bile ekranda ilk seçenek görünür. Kullanıcı o seçiciyi hiç AÇMADAN
 * kaydederse anahtarın gitmesi, kullanıcının VERMEDİĞİ kararı veriye yazmak
 * olurdu. Yalnız DÜZENLEME kipini ilgilendirir (oluşturmada ezilecek değer yok).
 */
describe("PersonnelForm (edit) · dokunulmamış varsayılan seçiciler", () => {
  it("sunucuda null olan payment_method DOKUNULMADAN kaydedilirse anahtar GİTMEZ", async () => {
    mockDetail({ payment_method: null });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    // Ekranda mockup'ın ilk seçeneği GÖRÜNÜR — ama bu kullanıcının kararı değil.
    expect(screen.getByLabelText("Ödeme Şekli")).toHaveValue("bank");

    await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Sıhhi Tesisatçı");
    await user.click(submitButton("Kaydet"));

    expect("payment_method" in updateMutate.mock.calls[0][0]).toBe(false);
  });

  it("kullanıcı Ödeme Şekli'ni SEÇERSE değer gövdede gider", async () => {
    mockDetail({ payment_method: null });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.selectOptions(screen.getByLabelText("Ödeme Şekli"), "cash");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({ payment_method: "cash" });
  });

  it("sunucuda null olan wage_type DOKUNULMADAN kaydedilirse anahtar GİTMEZ", async () => {
    mockDetail({ wage_type: null });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("Ücret Tipi")).toHaveValue("daily");

    await user.click(submitButton("Kaydet"));

    expect("wage_type" in updateMutate.mock.calls[0][0]).toBe(false);
  });

  it("kullanıcı Ücret Tipi'ni SEÇERSE değer gövdede gider", async () => {
    mockDetail({ wage_type: null });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.selectOptions(screen.getByLabelText("Ücret Tipi"), "monthly");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({ wage_type: "monthly" });
  });

  it("sunucudan DOLU gelen wage_type dokunulmasa da AYNI değerle gider (gerileme koruması)", async () => {
    mockDetail({ wage_type: "hourly", payment_method: "mixed" });
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.click(submitButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      wage_type: "hourly",
      payment_method: "mixed",
    });
  });

  it("OLUŞTURMA kipi etkilenmez — iki anahtar da HER ZAMAN gider", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="create" />);
    await user.type(screen.getByLabelText("Ad"), "Zeki");
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "company");
    await user.click(actionButton("Taslak Kaydet"));

    expect(createMutate.mock.calls[0][0]).toMatchObject({
      wage_type: "daily",
      payment_method: "bank",
    });
  });
});

describe("PersonnelForm (edit) · gönderim", () => {
  it("kaydet PATCH gövdesini üretir ve detay sayfasına döner", async () => {
    updateMutate.mockImplementation((_body, options) => options.onSuccess?.({}));
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);

    await user.selectOptions(screen.getByLabelText("Meslek / Görev"), "Sıhhi Tesisatçı");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      full_name: "Mehmet Yılmaz",
      trade: "Sıhhi Tesisatçı",
      source: "subcontractor",
      subcontractor_id: "sub-1",
      is_active: true,
      tc_no: "12345678901",
      assigned_project_id: "p-1",
    });
    // Formdan seçilemeyen bölüm gövdeye GİRMEZ → sunucudaki değer korunur.
    expect("assigned_section_id" in updateMutate.mock.calls[0][0]).toBe(false);
    expect(push).toHaveBeenCalledWith("/personel/per-9");
  });

  it("şirket kadrosuna dönülünce subcontractor_id AÇIKÇA null gider", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.selectOptions(screen.getByLabelText("Çalışan Tipi"), "company");
    await user.click(submitButton("Kaydet"));

    expect(updateMutate.mock.calls[0][0]).toMatchObject({ subcontractor_id: null });
  });

  it("İptal detay sayfasına döner (dönüş parametresi DEĞİL)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.click(screen.getAllByRole("button", { name: "İptal" })[0]);
    expect(push).toHaveBeenCalledWith("/personel/per-9");
  });

  it("sunucu hatası Türkçe gösterilir", async () => {
    updateMutate.mockImplementation((_body, options) =>
      options.onError?.(new BackendError(422, { detail: "geçersiz istek" })),
    );
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    await user.click(submitButton("Kaydet"));
    expect(screen.getByTestId("personnel-form-error")).toHaveTextContent(/geçersiz istek/);
  });
});

describe("PersonnelForm — SEKME-F1.3b kaydedilmemiş değişiklik kaydı", () => {
  it("oluşturma: açıldı/dokunulmadı → false; ad yazıldı → true; başarılı kayıt → false (yönlendirme)", async () => {
    const user = userEvent.setup();
    createMutate.mockImplementation((_body, options) => options.onSuccess?.());
    const { unmount } = render(<PersonnelForm mode="create" />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText("Ad"), "Mehmet");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("düzenleme: 🔴 ASYNC TABAN — sunucu verisi geldikten sonra da false (tohumlama `touched` kirletmez)", async () => {
    const user = userEvent.setup();
    render(<PersonnelForm mode="edit" personnelId="per-9" />);
    expect(screen.getByLabelText("Ad")).toHaveValue("Mehmet");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText("Soyad"), "x");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });
});
