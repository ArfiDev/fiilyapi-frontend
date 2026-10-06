import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BlockCreateView } from "./BlockCreateView";
import { BLOCK_PROJECT_REQUIRED_MESSAGE } from "./constants";
import { UNIT_FORM_TABS, unitFormTabsPendingReason } from "@/components/unit-shell/routes";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useCreateBlock } from "@/lib/api/hooks/useUnitMutations";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useUnitMutations", () => ({ useCreateBlock: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

let searchParams = new URLSearchParams();
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/satis/blok-ekle",
  useSearchParams: () => searchParams,
}));

function queryStub(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, error: null, ...extra } as never;
}

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  mutateAsync.mockResolvedValue({ id: "blk-yeni" });
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useProjects).mockReturnValue(
    queryStub({ items: [{ id: "prj-1", name: "Yeşilvadi Rezidans" }] }),
  );
  vi.mocked(useSites).mockReturnValue(
    queryStub({
      items: [
        { id: "site-1", name: "Yeşilvadi Şantiyesi" },
        { id: "site-2", name: "2. Etap Şantiyesi" },
      ],
    }),
  );
  vi.mocked(useCreateBlock).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
  } as never);
});

function selectProject() {
  fireEvent.change(screen.getByTestId("blok-form-proje"), { target: { value: "prj-1" } });
}

describe("BlockCreateView — TAM SAYFA kabuğu (BE 30-56)", () => {
  it("başlık, alt başlık ve breadcrumb basılır (modal DEĞİL)", () => {
    render(<BlockCreateView />);
    expect(
      screen.getByRole("heading", { name: "Yeni Blok Ekle", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Satış Yönetimi",
    );
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Blok Ekle",
    );
  });

  it("üç kart da basılır (BE 58 · 75 · 97)", () => {
    render(<BlockCreateView />);
    for (const title of ["Blok Bilgileri", "Yapı Bilgileri", "Ek Bilgiler"]) {
      expect(screen.getByRole("heading", { name: new RegExp(title), level: 2 })).toBeInTheDocument();
    }
  });
});

describe("🔴 BE 107-110 toplu üretim kutucuğu ARTIK GERÇEK (F-UNIT2 T2c)", () => {
  it("kutucuk ETKİNDİR, başlangıçta işaretsizdir ve pending gerekçesi KALMADI", () => {
    render(<BlockCreateView />);
    const checkbox = screen.getByTestId("blok-form-toplu-uretim");
    expect(checkbox).toBeEnabled();
    // Mockup kutuyu `checked` çizer ama bu ÖRNEK VERİDİR: gezinme kararı
    // kullanıcı adına verilmez.
    expect(checkbox).not.toBeChecked();
    // Hedef ekran canlıyken "henüz açılmadı" diyen bir not ekranda KALMAZ.
    expect(screen.queryByText(/henüz açılmadı/i)).toBeNull();
  });

  it("işaretliyken başarılı kayıt TOPLU ÜRETİM ekranına proje + YENİ BLOK bağlamıyla gider", async () => {
    // Yalnız `?proje=` vermek kullanıcıyı blok seçicisi BOŞ bir ekrana
    // bırakırdı ve kutucuk süsten ibaret kalırdı; blok kimliği oluşturma
    // cevabından (`BlockResponse.id`) gelir.
    render(<BlockCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("blok-form-toplu-uretim"));
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/satis/toplu-uretim?proje=prj-1&blok=blk-yeni"),
    );
  });

  it("işaretsizken davranış DEĞİŞMEDİ — satış listesine dönülür", async () => {
    render(<BlockCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/satis"));
  });

  it("🔴 gezinme bayrağı GÖVDEYE GİRMEZ (kutucuk işaretliyken bile)", () => {
    render(<BlockCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("blok-form-toplu-uretim"));
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    const body = mutateAsync.mock.calls[0][0].body as Record<string, unknown>;
    expect(Object.keys(body).filter((key) => /bulk|batch|toplu|generate/i.test(key))).toEqual([]);
  });
});

describe("BlockCreateView — PENDING yüzeyler: devre dışı + GÖRÜNÜR gerekçe", () => {

  it("BE 50-52 rotası YAZILMAMIŞ sekmeler devre dışıdır ve gerekçeleri EKRANDA", () => {
    // 🔴 Liste SABİT DEĞİL: F-UNIT2 sekmeleri tek tek canlandırdıkça küme
    // küçülür (bugün "Toplu Üretim" GERÇEK rotadadır).
    render(<BlockCreateView />);
    for (const tab of UNIT_FORM_TABS.filter((item) => item.href === undefined)) {
      const element = screen.getByRole("tab", { name: tab.label });
      expect(element, tab.label).toHaveAttribute("aria-disabled", "true");
      expect(element, tab.label).not.toHaveAttribute("href");
    }
    const reason = unitFormTabsPendingReason();
    expect(screen.queryByTestId("unite-form-sekme-gerekce") !== null).toBe(reason !== null);
    if (reason !== null) {
      expect(screen.getByTestId("unite-form-sekme-gerekce")).toHaveTextContent(reason);
    }
  });

  it("BE 49 'Ünite Ekle' sekmesi GERÇEK rotaya bağlıdır (silinmemiş, canlı)", () => {
    render(<BlockCreateView />);
    expect(screen.getByRole("tab", { name: "Ünite Ekle" })).toHaveAttribute(
      "href",
      "/satis/unite-ekle",
    );
  });
});

describe("BlockCreateView — kaskad: proje → şantiye", () => {
  it("proje seçilmeden şantiye seçicisi kapalıdır ve gerekçe GÖRÜNÜR", () => {
    render(<BlockCreateView />);
    expect(screen.getByTestId("blok-form-santiye")).toBeDisabled();
    expect(screen.getByTestId("blok-form-santiye-uyari")).toHaveTextContent(
      "Önce bir proje seçin",
    );
  });

  it("proje seçilince şantiye listesi açılır ve BE 68 ipucu GERÇEK sayıyı yazar", () => {
    render(<BlockCreateView />);
    selectProject();
    expect(screen.getByTestId("blok-form-santiye")).toBeEnabled();
    expect(screen.getByText("Bu projede 2 şantiye var — seçim zorunlu")).toBeInTheDocument();
    expect(screen.queryByTestId("blok-form-santiye-uyari")).not.toBeInTheDocument();
  });

  it("proje seçimi URL'ye yazılır (paylaşılabilir, yeniden yüklemede korunur)", () => {
    render(<BlockCreateView />);
    selectProject();
    expect(replaceMock).toHaveBeenCalledWith("/satis/blok-ekle?proje=prj-1", { scroll: false });
  });

  it("proje DEĞİŞİNCE şantiye seçimi sıfırlanır (liste projeye bağlıdır)", () => {
    render(<BlockCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("blok-form-santiye"), { target: { value: "site-2" } });
    expect(screen.getByTestId("blok-form-santiye")).toHaveValue("site-2");
    fireEvent.change(screen.getByTestId("blok-form-proje"), { target: { value: "" } });
    expect(screen.getByTestId("blok-form-santiye")).toHaveValue("");
  });

  it("`?proje=` ile gelindiğinde seçim TOHUMLANIR", () => {
    searchParams = new URLSearchParams("proje=prj-1");
    render(<BlockCreateView />);
    expect(screen.getByTestId("blok-form-proje")).toHaveValue("prj-1");
  });
});

describe("BlockCreateView — BE 88-94 tahmin paneli CANLI güncellenir", () => {
  it("üç girdi de boşken sayı BASILMAZ ('0' değil, '—') ve alt yazı yoktur", () => {
    render(<BlockCreateView />);
    expect(screen.getByTestId("blok-form-tahmin-sayi")).toHaveTextContent("—");
    expect(screen.queryByTestId("blok-form-tahmin-alt")).not.toBeInTheDocument();
  });

  it("mockup'ın kendi verisi ekranda 26 verir (8 × 3 + 2)", () => {
    render(<BlockCreateView />);
    fireEvent.change(screen.getByTestId("blok-form-kat"), { target: { value: "8" } });
    fireEvent.change(screen.getByTestId("blok-form-kat-basina-daire"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("blok-form-dukkan"), { target: { value: "2" } });
    expect(screen.getByTestId("blok-form-tahmin-sayi")).toHaveTextContent("26");
    expect(screen.getByTestId("blok-form-tahmin-alt")).toHaveTextContent(
      "8 kat × 3 daire + 2 dükkan",
    );
  });

  it("girdi değişince hem sayı hem alt yazı ANINDA değişir (sabit metin YOK)", () => {
    render(<BlockCreateView />);
    fireEvent.change(screen.getByTestId("blok-form-kat"), { target: { value: "8" } });
    fireEvent.change(screen.getByTestId("blok-form-kat-basina-daire"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("blok-form-kat"), { target: { value: "12" } });
    expect(screen.getByTestId("blok-form-tahmin-sayi")).toHaveTextContent("36");
    expect(screen.getByTestId("blok-form-tahmin-alt")).toHaveTextContent(
      "12 kat × 3 daire + 0 dükkan",
    );
  });

  it("bodrum kat sayısı paneli DEĞİŞTİRMEZ (BE 91 formülünde yok)", () => {
    render(<BlockCreateView />);
    fireEvent.change(screen.getByTestId("blok-form-bodrum"), { target: { value: "5" } });
    expect(screen.getByTestId("blok-form-tahmin-sayi")).toHaveTextContent("—");
  });
});

describe("BlockCreateView — kaydetme", () => {
  it("dolu form beklenen gövdeyi POST eder ve listeye döner", async () => {
    render(<BlockCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("blok-form-santiye"), { target: { value: "site-1" } });
    fireEvent.change(screen.getByTestId("blok-form-ad"), { target: { value: "C Blok" } });
    fireEvent.change(screen.getByTestId("blok-form-kod"), { target: { value: "YV-C" } });
    fireEvent.change(screen.getByTestId("blok-form-kat"), { target: { value: "8" } });
    fireEvent.change(screen.getByTestId("blok-form-insaat-alani"), { target: { value: "3200,50" } });
    fireEvent.change(screen.getByTestId("blok-form-cati"), { target: { value: "duplex" } });

    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(mutateAsync).toHaveBeenCalledWith({
      projectId: "prj-1",
      body: {
        name: "C Blok",
        sort_order: 0,
        site_id: "site-1",
        code: "YV-C",
        floor_count: 8,
        // TR virgülü noktaya çevrilir ve STRING gider (kuruş hassasiyeti).
        construction_area_m2: "3200.50",
        // Dokunulan TEK seçici; öteki üçü (82 · 86 · 101) gövdeye GİRMEZ.
        roof_type: "duplex",
      },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/satis"));
  });

  it("proje seçilmeden kaydetmeye çalışmak istek KURMAZ, görünür gerekçe basar", async () => {
    // `project_id` bir GÖVDE alanı değil YOL parçasıdır: boşken istek
    // `/projects//blocks` olurdu ve kullanıcı sebebini öğrenemeyeceği bir 422
    // alırdı (KARAR 11'in istisnası DEĞİL — karar gövde alanları içindir).
    render(<BlockCreateView />);
    fireEvent.change(screen.getByTestId("blok-form-ad"), { target: { value: "C Blok" } });
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByTestId("blok-form-hata")).toHaveTextContent(
      BLOCK_PROJECT_REQUIRED_MESSAGE,
    );
  });

  it("BOŞ ad istemcide ENGELLENMEZ — istek gider, kararı sunucu verir (KARAR 11)", async () => {
    render(<BlockCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].body).toEqual({ name: "", sort_order: 0 });
  });

  it("sunucu hatası OLDUĞU GİBİ basılır; listeye yönlendirme YAPILMAZ", async () => {
    mutateAsync.mockRejectedValue(
      new BackendError(422, { detail: "Bu projede birden çok şantiye var; şantiye seçimi zorunlu." }),
    );
    render(<BlockCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    expect(await screen.findByTestId("blok-form-hata")).toHaveTextContent(
      "Bu projede birden çok şantiye var; şantiye seçimi zorunlu.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("İptal listeye döner (mockup'ta bir <a href>, yani gezinme)", () => {
    render(<BlockCreateView />);
    fireEvent.click(screen.getAllByRole("button", { name: "İptal" })[0]);
    expect(pushMock).toHaveBeenCalledWith("/satis");
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("BlockCreateView — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<BlockCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alana dokunuldu → kirli", () => {
    render(<BlockCreateView />);
    fireEvent.change(screen.getByTestId("blok-form-ad"), { target: { value: "A Blok" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (router.push unmount eder) → temiz", async () => {
    const { unmount } = render(<BlockCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("blok-form-ad"), { target: { value: "A Blok" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("blok-form-kaydet"));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
