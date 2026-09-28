import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteCreateView } from "./SiteCreateView";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useCreateSite } from "@/lib/api/hooks/useSiteMutations";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { BackendError } from "@/lib/api/unwrap";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { MESSAGES, validateSiteForm } from "./validate";
import { emptySiteFormValues } from "./form-state";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const NEW_SITE_ID = "22222222-2222-4222-8222-222222222222";
const CHIEF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

// Kisi seciciler kendi sorgusunu acar; bu dosya KABUGU + GONDERIMI test eder.
// Ayrintili secici durumlari (403 dahil) SiteInfoCard.test.tsx'te sinanir.
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useSiteMutations", () => ({
  useCreateSite: vi.fn(),
}));

// Bolumler AYNI govdede gider (§3.4): bu hook'un cagrilmadigi sinanir.
const createSectionMock = vi.fn();
vi.mock("@/lib/api/hooks/useSectionMutations", () => ({
  useCreateSection: () => {
    createSectionMock();
    return { mutate: vi.fn(), isPending: false };
  },
}));

const mutateMock = vi.fn();

function mockCreateSite(overrides: Record<string, unknown> = {}) {
  vi.mocked(useCreateSite).mockReturnValue({
    mutate: mutateMock,
    isPending: false,
    ...overrides,
  } as never);
}

function mockUsers(overrides: Record<string, unknown> = {}) {
  vi.mocked(useUserOptions).mockReturnValue({
    options: [{ id: CHIEF_ID, full_name: "Ali Vural", title: "Şantiye Şefi" }],
    isForbidden: false,
    isLoading: false,
    isError: false,
    ...overrides,
  } as never);
}

vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));

const PROJECT = {
  id: PROJECT_ID,
  name: "Güneşkent Konut",
  code: "SZL-2025-001",
  project_type: "taahhut",
} as never;

function mockProject(overrides: Record<string, unknown> = {}) {
  vi.mocked(useProject).mockReturnValue({
    data: PROJECT,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProject();
  mockCreateSite();
  mockUsers();
});

/** Zorunlu alanları doldurur (spec §10.1) — gönderim testlerinin ön koşulu. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Şantiye Adı"), "C-Blok Şantiyesi");
  await user.selectOptions(screen.getByLabelText("Şantiye Şefi"), CHIEF_ID);
  await user.type(screen.getByLabelText("İl / İlçe"), "Çankaya / Ankara");
  await user.type(screen.getByLabelText("İnşaat Alanı (m²)"), "6420");
  // type="date" jsdom'da userEvent.type ile guvenilir degil.
  fireEvent.change(screen.getByLabelText("Başlangıç Tarihi"), {
    target: { value: "01.01.2026" },
  });
  fireEvent.change(screen.getByLabelText("Planlanan Bitiş"), {
    target: { value: "01.06.2026" },
  });
}

function clickSubmit(user: ReturnType<typeof userEvent.setup>) {
  const strip = document.querySelector(".pf-actions") as HTMLElement;
  return user.click(within(strip).getByRole("button", { name: "Şantiyeyi Oluştur" }));
}

describe("SiteCreateView — kabuk (mockup 35–60)", () => {
  it("kirinti yolu uc seviyelidir: Projeler / {proje adi} / Yeni Santiye", () => {
    render(<SiteCreateView />);
    const nav = screen.getByRole("navigation", { name: "Kırıntı yolu" });
    expect(within(nav).getByText("Projeler")).toBeInTheDocument();
    expect(within(nav).getByText("Güneşkent Konut")).toBeInTheDocument();
    expect(within(nav).getByText("Yeni Şantiye")).toBeInTheDocument();
  });

  it("Projeler kirintisi /projeler'e, orta kirinti /projeler/{id}'ye baglanir", () => {
    render(<SiteCreateView />);
    const nav = screen.getByRole("navigation", { name: "Kırıntı yolu" });
    expect(within(nav).getByRole("link", { name: "Projeler" })).toHaveAttribute(
      "href",
      "/projeler",
    );
    expect(
      within(nav).getByRole("link", { name: "Güneşkent Konut" }),
    ).toHaveAttribute("href", `/projeler/${PROJECT_ID}`);
  });

  it("aktif kirinti bagsizdir", () => {
    render(<SiteCreateView />);
    const nav = screen.getByRole("navigation", { name: "Kırıntı yolu" });
    const current = within(nav).getByText("Yeni Şantiye");
    expect(current.tagName).toBe("SPAN");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "Yeni Şantiye" })).toBeNull();
  });

  it("h1 'Yeni Santiye Ekle' basar ve sayfada tek h1 vardir", () => {
    render(<SiteCreateView />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Yeni Şantiye Ekle");
  });

  it("alt baslik mockup satir 50 metnini basar", () => {
    render(<SiteCreateView />);
    expect(
      screen.getByText(
        "Şantiye bir projeye bağlıdır — poz kotaları proje sözleşmesinden dağıtılır",
      ),
    ).toBeInTheDocument();
  });

  it("Bagli Proje bilgi kutusu proje adi, kodu ve tipini basar", () => {
    render(<SiteCreateView />);
    const info = screen.getByTestId("site-form-project-info");
    expect(info).toHaveTextContent("Bağlı Proje:");
    // Mockup satır 56 birebir: "· Taahhüt Projesi" (sekme adı "Taahhüt" DEĞİL).
    expect(info).toHaveTextContent("Güneşkent Konut (SZL-2025-001) · Taahhüt Projesi");
    expect(info).toHaveTextContent(
      "Şantiye oluşturulduktan sonra poz dağılımı ekranından bu şantiyeye kota atayabilirsiniz.",
    );
  });

  it("Poz Dagilimi baglantisi tiklanamaz span'dir ve pendingModuleLabel('contracts') title'i tasir", () => {
    render(<SiteCreateView />);
    const link = screen.getByText("Poz Dağılımı →");
    expect(link.tagName).toBe("SPAN");
    expect(link).toHaveAttribute("title", pendingModuleLabel("contracts"));
    expect(screen.queryByRole("link", { name: "Poz Dağılımı →" })).toBeNull();
  });
});

describe("SiteCreateView — belgeler + alt eylem şeridi (T9)", () => {
  it("belgeler karti govdeye baglidir", () => {
    render(<SiteCreateView />);
    expect(
      screen.getByRole("heading", { name: /📎 Şantiye Belgeleri/ }),
    ).toBeInTheDocument();
  });

  it("tum sayfada input[type=file] YOK", () => {
    const { container } = render(<SiteCreateView />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("ust bar ve alt serit ayni uc eylemi sunar", () => {
    const { container } = render(<SiteCreateView />);
    const topbar = container.querySelector(".pf-topbar__actions");
    const strip = container.querySelector(".pf-actions");

    // Üst bar: İptal + Şantiyeyi Oluştur (mockup 41–42)
    expect(within(topbar as HTMLElement).getByRole("button", { name: "İptal" })).toBeInTheDocument();
    expect(
      within(topbar as HTMLElement).getByRole("button", { name: "Şantiyeyi Oluştur" }),
    ).toBeInTheDocument();

    // Alt şerit: İptal + Taslak Kaydet + Şantiyeyi Oluştur (mockup 225–227)
    expect(within(strip as HTMLElement).getByRole("button", { name: "İptal" })).toBeInTheDocument();
    expect(
      within(strip as HTMLElement).getByRole("button", { name: "Taslak Kaydet" }),
    ).toBeInTheDocument();
    expect(
      within(strip as HTMLElement).getByRole("button", { name: "Şantiyeyi Oluştur" }),
    ).toBeInTheDocument();
  });
});

describe("SiteCreateView — proje sorgusu durumlari (spec §12)", () => {
  it("proje yuklenirken kirinti yolunda ... basar, form alanlari devre disi degildir", () => {
    mockProject({ data: undefined, isLoading: true });
    const { container } = render(<SiteCreateView />);

    const nav = screen.getByRole("navigation", { name: "Kırıntı yolu" });
    expect(within(nav).getByText("…")).toBeInTheDocument();
    // Bilgi kutusu satır yüksekliğini koruyan gri şeride döner.
    expect(screen.getByTestId("site-form-project-info-skeleton")).toBeInTheDocument();
    // Form gövdesi basılır ve eylemler devre dışı DEĞİLDİR.
    expect(screen.getByTestId("site-form-body")).toBeInTheDocument();
    const topbar = container.querySelector(".pf-topbar__actions") as HTMLElement;
    expect(
      within(topbar).getByRole("button", { name: "Şantiyeyi Oluştur" }),
    ).not.toBeDisabled();
  });

  it("proje 404 ise 'Proje bulunamadi' ve /projeler donus baglantisi basar, form basilmaz", () => {
    mockProject({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(404, "Not Found"),
    });
    render(<SiteCreateView />);

    expect(screen.getByText("Proje bulunamadı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projeler" })).toHaveAttribute(
      "href",
      "/projeler",
    );
    expect(screen.queryByTestId("site-form-body")).toBeNull();
  });

  it("proje 403 ise AccessDenied basar", () => {
    mockProject({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, "Forbidden"),
    });
    render(<SiteCreateView />);

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByTestId("site-form-body")).toBeNull();
  });
});

describe("SiteCreateView — gönderim (T10, spec §9.3, §9.4, §12)", () => {
  it("'Santiyeyi Olustur' tek POST atar ve bolumleri ayni govdede gonderir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);

    const rows = screen.getAllByTestId("section-row");
    await user.type(within(rows[0]).getByLabelText("1. bölümün adı"), "Kaba Yapı");
    await clickSubmit(user);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const body = mutateMock.mock.calls[0][0];
    expect(body.name).toBe("C-Blok Şantiyesi");
    expect(body.site_manager_user_id).toBe(CHIEF_ID);
    expect(body.sections).toEqual([{ name: "Kaba Yapı" }]);
    expect(body.is_draft).toBe(false);
  });

  it("govdede safety_officer_is_outsourced ve is_draft HER ZAMAN vardir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);

    const body = mutateMock.mock.calls[0][0];
    expect("safety_officer_is_outsourced" in body).toBe(true);
    expect("is_draft" in body).toBe(true);
  });

  it("useCreateSection HIC cagrilmaz", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);

    expect(createSectionMock).not.toHaveBeenCalled();
  });

  it("basarida /projeler/{id}/santiyeler/{yeni siteId}'e yonlendirir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);

    const options = mutateMock.mock.calls[0][1];
    options.onSuccess({ id: NEW_SITE_ID });
    expect(pushMock).toHaveBeenCalledWith(
      `/projeler/${PROJECT_ID}/santiyeler/${NEW_SITE_ID}`,
    );
  });

  it("'Taslak Kaydet' is_draft=true ile POST atar (eksik zorunlulara ragmen)", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await user.type(screen.getByLabelText("Şantiye Adı"), "C-Blok Şantiyesi");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0].is_draft).toBe(true);
  });

  it("taslakta ad bosken POST ATILMAZ", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("taslak basarisinda /projeler/{id}'e yonlendirir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await user.type(screen.getByLabelText("Şantiye Adı"), "C-Blok Şantiyesi");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    mutateMock.mock.calls[0][1].onSuccess({ id: NEW_SITE_ID });
    expect(pushMock).toHaveBeenCalledWith(`/projeler/${PROJECT_ID}`);
  });

  it("'Iptal' /projeler/{id}'e gider ve beforeunload uyarisi vermez", async () => {
    const user = userEvent.setup();
    const addListener = vi.spyOn(window, "addEventListener");
    render(<SiteCreateView />);
    await user.type(screen.getByLabelText("Şantiye Adı"), "kirli form");

    const strip = document.querySelector(".pf-actions") as HTMLElement;
    await user.click(within(strip).getByRole("button", { name: "İptal" }));

    expect(pushMock).toHaveBeenCalledWith(`/projeler/${PROJECT_ID}`);
    expect(addListener.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    addListener.mockRestore();
  });

  it("kaydederken uc buton da disabled, birincil metni 'Kaydediliyor…'", () => {
    mockCreateSite({ isPending: true });
    render(<SiteCreateView />);

    const strip = document.querySelector(".pf-actions") as HTMLElement;
    expect(within(strip).getByRole("button", { name: "İptal" })).toBeDisabled();
    expect(within(strip).getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
    expect(within(strip).getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled();
    expect(
      within(strip).queryByRole("button", { name: "Şantiyeyi Oluştur" }),
    ).toBeNull();
  });

  it("kaydederken form alanlari disabled DEGIL", () => {
    mockCreateSite({ isPending: true });
    render(<SiteCreateView />);
    expect(screen.getByLabelText("Şantiye Adı")).not.toBeDisabled();
    expect(screen.getByLabelText("İl / İlçe")).not.toBeDisabled();
  });

  it("409'da 'Bu santiye kodu zaten kullaniliyor…' mesaji basar", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);

    mutateMock.mock.calls[0][1].onError(new BackendError(409, "conflict"));
    expect(await screen.findAllByText(MESSAGES.siteCodeConflict)).not.toHaveLength(0);
  });

  it("409 disi sunucu hatasinda backendErrorMessage basilir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);

    await act(async () => {
      mutateMock.mock.calls[0][1].onError(new BackendError(500, "boom"));
    });
    const banner = document.querySelector(".pf-form-error") as HTMLElement;
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).not.toBe(MESSAGES.siteCodeConflict);
  });

  it("dogrulama basarisizsa POST ATILMAZ ve ilk hatali alana odak tasinir", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await clickSubmit(user);

    expect(mutateMock).not.toHaveBeenCalled();
    // Alanın altında + özet şeridinde: ikisi de basılır (§12).
    expect(screen.getAllByText(MESSAGES.nameRequired).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByLabelText("Şantiye Adı"));
  });

  it("hata ozeti role=alert ile duyurulur", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await clickSubmit(user);

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => el.textContent === MESSAGES.nameRequired)).toBe(true);
  });

  it("bolum satiri hatasi gonderimi engeller", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);

    const rows = screen.getAllByTestId("section-row");
    // Adı boş ama tarihi dolu satır: sessizce atılmaz, hata verir (§6.5).
    fireEvent.change(within(rows[0]).getByLabelText("1. bölümün başlangıç tarihi"), {
      target: { value: "01.02.2026" },
    });
    await clickSubmit(user);

    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/1\. satır: Bölüm adı zorunludur\./)).toBeInTheDocument();
  });

  it("kismi basari mesaji YOKTUR", async () => {
    const user = userEvent.setup();
    const { container } = render(<SiteCreateView />);
    await fillRequired(user);
    await clickSubmit(user);
    mutateMock.mock.calls[0][1].onError(new BackendError(500, "boom"));

    expect(container.textContent).not.toMatch(/bölüm eklenemedi/i);
  });
});

describe("SiteCreateView — her doğrulama hatası EKRANDA görünür (§10, §12)", () => {
  // Kapsam korkuluğu: `validateSiteForm` bir anahtar üretip kart onu Field'e
  // geçirmezse mesaj SESSİZCE kaybolur — kullanıcı neyi düzelteceğini bilemez.
  // Mesaj METNİ birden çok alanda aynı olabildiği için (ör. "Değer negatif
  // olamaz.") kontrol ALAN BAZINDA yapılır: hatalı alan `aria-invalid` alır.
  const FIELD_LABELS: Record<string, string> = {
    name: "Şantiye Adı",
    code: "Şantiye Kodu",
    siteManagerUserId: "Şantiye Şefi",
    city: "İl / İlçe",
    landAreaM2: "Arsa Alanı (m²)",
    constructionAreaM2: "İnşaat Alanı (m²)",
    startDate: "Başlangıç Tarihi",
    endDate: "Planlanan Bitiş",
    budget: "Şantiye Bütçesi (₺)",
    plannedWorkerCount: "Planlanan İşçi Sayısı",
  };

  it("validateSiteForm'un urettigi TUM anahtarlarin bir etiket karsiligi vardir", () => {
    // Yeni bir hata anahtarı eklenir ve karta bağlanmazsa bu liste eksik kalır.
    const everyKey = validateSiteForm(
      {
        ...emptySiteFormValues(),
        landAreaM2: "abc",
        constructionAreaM2: "-1",
        budget: "-1",
        plannedWorkerCount: "4.5",
        startDate: "2026-06-01",
        endDate: "2026-01-01",
      },
      { isDraft: false, isUserListUnavailable: false },
    );
    for (const key of Object.keys(everyKey)) {
      expect(FIELD_LABELS[key], `"${key}" icin ekran alani eslenmemis`).toBeDefined();
    }
  });

  it("negatif sayi girilen UC alanin da kendisi aria-invalid olur", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await fillRequired(user);

    await user.type(screen.getByLabelText(FIELD_LABELS.landAreaM2), "-1");
    await user.type(screen.getByLabelText(FIELD_LABELS.budget), "-1");
    await user.type(screen.getByLabelText(FIELD_LABELS.plannedWorkerCount), "-1");
    await clickSubmit(user);

    expect(mutateMock).not.toHaveBeenCalled();
    for (const key of ["landAreaM2", "budget", "plannedWorkerCount"]) {
      expect(
        screen.getByLabelText(FIELD_LABELS[key]),
        `"${key}" alani hatali isaretlenmemis`,
      ).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("zorunlu alanlar bosken hepsi aria-invalid olur", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await clickSubmit(user);

    for (const key of ["name", "siteManagerUserId", "city", "constructionAreaM2", "startDate", "endDate"]) {
      expect(
        screen.getByLabelText(FIELD_LABELS[key]),
        `"${key}" alani hatali isaretlenmemis`,
      ).toHaveAttribute("aria-invalid", "true");
    }
  });
});

describe("SiteCreateView — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<SiteCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan yazıldı → true", async () => {
    const user = userEvent.setup();
    render(<SiteCreateView />);
    await user.type(screen.getByLabelText("Şantiye Adı"), "C-Blok Şantiyesi");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: router.push) → unmount ile false", async () => {
    mutateMock.mockImplementation((_body, opts) => opts?.onSuccess?.({ id: NEW_SITE_ID, code: "STE-1" }));
    const user = userEvent.setup();
    const { unmount } = render(<SiteCreateView />);
    await fillRequired(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await clickSubmit(user);
    expect(pushMock).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
