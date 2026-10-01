import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";

import { GeneralSiteDiaryView } from "./GeneralSiteDiaryView";
import { useSession } from "@/components/shell/SessionProvider";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import {
  useSiteDiaryEntries,
  useSiteDiaryEntry,
  type SiteDiaryEntryListResponse,
} from "@/lib/api/hooks/useSiteDiary";
import {
  useCreateSiteDiaryEntry,
  useReopenSiteDiaryEntry,
  useSaveSiteDiaryLines,
  useSubmitSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "@/lib/api/hooks/useSiteDiaryMutations";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import type { MeResponse } from "@/lib/auth/types";

/**
 * F-NAVSAHA · `/gunluk-kayit` ekranının KENDİ davranışları. Ortak gövde
 * (`DiaryEntryScreen`) şantiye rotasının 456 satırlık dosyasında ölçülür;
 * buradaki iddialar kök ekranın ŞANTİYE ROTASINDAN AYRILDIĞI yerlere
 * odaklanır: şantiye seçici, `?site=` URL durumu, ilk-seçenek varsayılanı,
 * boş liste gerekçesi ve drill sekme şeridinin YOKLUĞU (E7).
 */

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/gunluk-kayit",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({
  useSiteDiaryEntries: vi.fn(),
  useSiteDiaryEntry: vi.fn(),
}));
// GKS-F1.3 · kayıtsız gün önizlemesi: istenen gün/bölüm için boş, güncel iskelet.
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", async () => ({
  useSiteDiarySkeleton: (await import("@/components/site-diary/diary-skeleton.testkit")).echoSkeletonQuery,
}));
vi.mock("@/lib/api/hooks/useSiteDiaryMutations", () => ({
  useCreateSiteDiaryEntry: vi.fn(),
  useUpdateSiteDiaryEntry: vi.fn(),
  useSaveSiteDiaryLines: vi.fn(),
  useSubmitSiteDiaryEntry: vi.fn(),
  useReopenSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSitePlanDaySummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSitePlanDaySummary")>()),
  useSitePlanDaySummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useBoq", () => ({ useBoq: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({
  useSiteSubcontractorPayments: vi.fn(),
}));
// PLN-F2.2 — işçi kartının taşeron firma okuması (kendi ekip saati PLN-F2.1b'den
// beri kayıt yanıtında: `own_crew_from_timesheet`).
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));

const BASE_ME = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "sef@ornek.com",
  full_name: "Sercan Öztürk",
  role_key: "site_chief",
  status: "active",
} as unknown as MeResponse;

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: { ...BASE_ME, permissions } as MeResponse,
    isLoading: false,
  });
}

const OPTIONS = [
  { siteId: "s-1", projectId: "p-1", label: "Güneşkent A-Blok" },
  { siteId: "s-2", projectId: "p-2", label: "Çelik OSB Fabrika" },
];

function mockOptions(
  options: typeof OPTIONS = OPTIONS,
  state: { isLoading?: boolean; isError?: boolean } = {},
) {
  vi.mocked(useSiteOptions).mockReturnValue({
    options,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

function mockMutation() {
  return { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  mockSession({ site_diary: "full", progress_payments: "view" });
  mockOptions();
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: { items: [], total: 0, limit: 50, offset: 0 } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useSiteDiaryEntry).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  /**
   * 🔴 MOCK İSTENEN ŞANTİYEYE CEVAP VERİR — sabit dönen bir mock, ekran
   * hangi şantiyeyi sorarsa sorsun HEP `s-1`i döndürür ve "yeni şantiyenin
   * kimliğiyle besleniyor mu" iddiası YAPISAL OLARAK sınanamaz hâle gelirdi
   * (`useCreateSiteDiaryEntry` her zaman `s-1` görürdü).
   */
  vi.mocked(useSite).mockImplementation(
    (siteId: string) =>
      ({
        data:
          siteId === ""
            ? undefined
            : siteId === "s-2"
              ? {
                  id: "s-2",
                  name: "OSB Fabrika",
                  project: { id: "p-2", name: "Çelik OSB" },
                  sections: [],
                }
              : {
                  id: "s-1",
                  name: "A-Blok Şantiyesi",
                  project: { id: "p-1", name: "Güneşkent" },
                  sections: [],
                },
        isLoading: false,
        isError: false,
        error: null,
      }) as never,
  );
  vi.mocked(useBoq).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useProgressPayments).mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
  vi.mocked(useSubcontractors).mockReturnValue({
    data: { items: [] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation());
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation());
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation());
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation());
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation());
});

describe("GeneralSiteDiaryView · şantiye seçici", () => {
  it("ekran gercekten basilir (ComingSoon DEGIL)", () => {
    render(<GeneralSiteDiaryView />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" }),
    ).toBeInTheDocument();
  });

  it("secici TUM santiye secenekleriyle dolar (E5 98 deseni)", () => {
    render(<GeneralSiteDiaryView />);
    const select = screen.getByLabelText("Şantiye");
    expect(
      [...select.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Güneşkent A-Blok", "Çelik OSB Fabrika"]);
  });

  it("URL'de ?site= yokken ILK secenek secilidir", () => {
    render(<GeneralSiteDiaryView />);
    expect(screen.getByLabelText("Şantiye")).toHaveValue("s-1");
    // Ortak gövde o şantiyenin kimliğiyle beslenir.
    expect(vi.mocked(useSite)).toHaveBeenCalledWith("s-1", { project: "p-1" });
  });

  it("?site= URL'den okunur ve ortak govdeye O santiye gecirilir", () => {
    searchParams = new URLSearchParams({ site: "s-2" });
    render(<GeneralSiteDiaryView />);
    expect(screen.getByLabelText("Şantiye")).toHaveValue("s-2");
    expect(vi.mocked(useSite)).toHaveBeenCalledWith("s-2", { project: "p-2" });
  });

  /**
   * 🔴 URL BILINMEYEN BIR SANTIYE TASIYABILIR (elle yazilmis/bayat baglanti).
   * O deger ortak govdeye GECIRILSEYDI `useSite` 404'e gider ve ekran sessizce
   * bos kalirdi; secici de hicbir secenege denk dusmeyen bir degeri gosterip
   * BOS gorunurdu. Bilinmeyen deger ilk secenege duser.
   */
  it("URL'deki BILINMEYEN santiye ilk secenege duser (sessiz bos ekran YOK)", () => {
    searchParams = new URLSearchParams({ site: "yok-boyle-bir-santiye" });
    render(<GeneralSiteDiaryView />);
    expect(screen.getByLabelText("Şantiye")).toHaveValue("s-1");
    expect(vi.mocked(useSite)).toHaveBeenCalledWith("s-1", { project: "p-1" });
  });

  /**
   * 🔴 ADRES ile EKRAN ÇELİŞMEZ. Bilinmeyen `?site=` sessizce ilk seçeneğe
   * düşerse ama URL düzeltilmezse, kullanıcı `yok-boyle-bir-santiye` yazan
   * adresi paylaşır ve karşı taraf BAŞKA şantiye görür.
   */
  it("BILINMEYEN ?site= URL'de DUZELTILIR", () => {
    searchParams = new URLSearchParams({ site: "yok-boyle-bir-santiye" });
    render(<GeneralSiteDiaryView />);
    expect(replace).toHaveBeenCalledWith("/gunluk-kayit?site=s-1", { scroll: false });
  });

  it("?site= HIC YOKKEN de cozulon santiye URL'e yazilir (paylasilabilirlik)", () => {
    render(<GeneralSiteDiaryView />);
    expect(replace).toHaveBeenCalledWith("/gunluk-kayit?site=s-1", { scroll: false });
  });

  it("URL zaten hizaliysa TEKRAR yazilmaz (donguye girmez)", () => {
    searchParams = new URLSearchParams({ site: "s-2" });
    render(<GeneralSiteDiaryView />);
    // PLN-F3.0-ek (lider denetimi): çekirdeğin `?tarih=` efekti AÇILIŞTA
    // yazmaz (`?tarih=` yoksa ilk değer zaten BUGÜNE düşer — URL'e "bugün"ü
    // yazmak gereksiz bir yumuşak navigasyon + kardeş `?site=` efektiyle
    // aynı ilk karede yarış olurdu). Bu yüzden `replace` HİÇ çağrılmaz.
    expect(replace).not.toHaveBeenCalled();
  });

  it("santiye YOKKEN URL'e uydurma deger YAZILMAZ", () => {
    mockOptions([]);
    render(<GeneralSiteDiaryView />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("PLN-F3.0-ek · açılışta `?tarih=` yoksa replace ÇAĞRILMAZ (yalnız `?site=` hizası varsa çağrılır, tarih için değil)", () => {
    searchParams = new URLSearchParams();
    render(<GeneralSiteDiaryView />);
    // `?site=` hiç yoktu → tek çağrı SİTE hizasıdır; tarih hiçbir çağrıda YOKTUR.
    for (const call of replace.mock.calls) {
      expect(new URL(call[0] as string, "http://x").searchParams.has("tarih")).toBe(false);
    }
  });

  it("PLN-F3.0-ek · gün DEĞİŞİNCE `?tarih=` yazılır ve `?site=` KORUNUR", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ site: "s-1" });
    const createMutate = vi.fn().mockResolvedValue({
      id: "e-9",
      entry_date: "2026-01-15",
      status: "draft",
      lines: [],
      worker_counts: [],
      own_crew_from_timesheet: [],
      updated_at: "2026-01-15T00:00:00Z",
    });
    vi.mocked(useCreateSiteDiaryEntry).mockReturnValue({
      mutateAsync: createMutate,
      mutate: vi.fn(),
      isPending: false,
    } as never);
    render(<GeneralSiteDiaryView />);
    replace.mockClear(); // açılış hizası (varsa) bu testin konusu değil

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/gunluk-kayit?site=s-1&tarih=2026-01-15", {
        scroll: false,
      }),
    );
  });

  it("secim URL'e yazilir (paylasilabilir baglanti, yol ELLE kurulmaz)", async () => {
    const user = userEvent.setup();
    render(<GeneralSiteDiaryView />);
    await user.selectOptions(screen.getByLabelText("Şantiye"), "s-2");
    expect(replace).toHaveBeenCalledWith("/gunluk-kayit?site=s-2", { scroll: false });
  });

  /**
   * 🔴 SAHTE-YEŞİL DÜZELTMESİ. Bu testin ilk hâli `useSite`ı ŞANTİYELİ
   * bırakıyordu, yani "şantiye yok" derken ekran hâlâ A-Blok'un verisini
   * basıyordu — gerçek boş hâli YAPISAL OLARAK göremiyordu. Üretimde
   * `useSite` `enabled: siteId.length > 0` ile HİÇ koşmaz; mock da o hâle
   * kurulur (`data: undefined`).
   */
  function mockSitesiz() {
    mockOptions([]);
    // `useSite` zaten bos `siteId` icin `data: undefined` doner (uretimde
    // `enabled: siteId.length > 0` ile HIC kosmaz) — mock o hali tasir.
  }

  it("santiye YOKKEN secici devre disi ve GEREKCE yazilir", () => {
    mockSitesiz();
    render(<GeneralSiteDiaryView />);
    expect(screen.getByLabelText("Şantiye")).toBeDisabled();
    expect(screen.getByText("Kayıt girilebilecek şantiye bulunmuyor.")).toBeInTheDocument();
  });

  /**
   * 🔴 ŞANTİYESİZKEN EKRAN YAZILAMAZ. Emrin boş-durum kuralı ("uydurma veri
   * YOK") yalnız bir gerekçe paragrafı basmak DEĞİLDİR: form açık ve butonlar
   * etkin kalırsa kullanıcı hedefi olmayan bir taslağı doldurmaya davet
   * edilir ve `POST` gövdesinin `site_id`si BOŞ giderdi.
   */
  it("santiye YOKKEN yazma butonlari HIC basilmaz", () => {
    mockSitesiz();
    render(<GeneralSiteDiaryView />);
    expect(screen.queryByRole("button", { name: "Taslak Kaydet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kaydet & Gönder/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Şantiye seçilmedi/)).toBeInTheDocument();
  });

  /**
   * 🔴 POZİTİF KONTROL — yukarıdaki iddia butonlar HİÇBİR ZAMAN basılmasa da
   * yeşil kalırdı. Şantiye VARKEN aynı butonların GERÇEKTEN basıldığı ayrıca
   * ölçülür, yoksa "yazma kapalı" bekçisi hiçbir şey bekçilemez.
   */
  it("kontrol: santiye VARKEN yazma butonlari basilir", () => {
    render(<GeneralSiteDiaryView />);
    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeInTheDocument();
  });

  /**
   * 🔴 `base` şantiyesizken `/projeler//santiyeler/` gibi ÇİFT SLAŞLI bozuk
   * bir yol kurar. Böyle bir href basılırsa kullanıcı 404'e/catch-all'a
   * tıklar. Bu iddia o sınıfı bütünsel yakalar.
   */
  it("santiye YOKKEN hicbir href CIFT SLAS icermez", () => {
    mockSitesiz();
    const { container } = render(<GeneralSiteDiaryView />);
    const bozuk = [...container.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.includes("//"));
    expect(bozuk, `bozuk href: ${bozuk.join(", ")}`).toEqual([]);
  });

  it("liste YUKLENIRKEN gerekce 'Yukleniyor' olur (hata sanilmaz)", () => {
    mockOptions([], { isLoading: true });
    render(<GeneralSiteDiaryView />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(
      screen.queryByText("Kayıt girilebilecek şantiye bulunmuyor."),
    ).not.toBeInTheDocument();
  });

  it("liste HATALIYSA gerekce hatayi soyler (bos liste sanilmaz)", () => {
    mockOptions([], { isError: true });
    render(<GeneralSiteDiaryView />);
    expect(screen.getByText("Şantiye listesi yüklenemedi.")).toBeInTheDocument();
  });
});

/**
 * 🔴🔴 MERGE ENGELİ BEKÇİSİ — ÇAPRAZ-ŞANTİYE VERİ BULAŞMASI.
 *
 * Şantiye kapsamlı ikizde bu sınıf YAPISAL OLARAK imkânsızdı (şantiye
 * değişmek = rota değişmek = yeniden montaj). Kök rotada şantiye bir SORGU
 * parametresidir, bileşen monteli kalır — sınıfı BU DİLİM doğurdu.
 *
 * Mekanizma: `DiaryEntryScreen`in tohumlama anahtarı şantiye TAŞIMAZ
 * (`seedKey = "new:<activeDate>"`) ve etkisi erken döner. Şantiye değişip
 * TARİH aynı kalınca ve iki şantiyede de o gün kayıt yokken form OLDUĞU GİBİ
 * kalır: önceki şantiyenin notu ve `sectionId`si yeni şantiyenin POST
 * gövdesine sızar. `sectionId` başka bir PROJENİN bölümü olabilir ve
 * seçicide görünmediği için kullanıcı gönderdiğini GÖREMEZ.
 *
 * Çözüm `key={siteId}` — alt ağaç sökülüp yeniden kurulur.
 */
describe("🔴 capraz-santiye veri bulasmasi", () => {
  it("santiye degisince form SIFIRLANIR (not onceki santiyeden TASINMAZ)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GeneralSiteDiaryView />);

    const not = screen.getByRole("textbox", { name: /Yapılan İşler/ });
    await user.type(not, "A-Blok kalip sokuldu");
    expect(not).toHaveValue("A-Blok kalip sokuldu");

    searchParams = new URLSearchParams({ site: "s-2" });
    rerender(<GeneralSiteDiaryView />);

    // 🔴 Asıl iddia: `key` kaldırılırsa burası "A-Blok kalip sokuldu" kalır.
    expect(screen.getByRole("textbox", { name: /Yapılan İşler/ })).toHaveValue("");
  });

  it("santiye degisince ortak govde YENI santiyenin kimligiyle beslenir", () => {
    const { rerender } = render(<GeneralSiteDiaryView />);
    expect(vi.mocked(useSite)).toHaveBeenCalledWith("s-1", { project: "p-1" });

    searchParams = new URLSearchParams({ site: "s-2" });
    rerender(<GeneralSiteDiaryView />);
    expect(vi.mocked(useSite)).toHaveBeenLastCalledWith("s-2", { project: "p-2" });
    // POST hedefi de yeni şantiyeye bağlanır.
    expect(vi.mocked(useCreateSiteDiaryEntry)).toHaveBeenLastCalledWith("s-2");
  });
});

describe("GeneralSiteDiaryView · kabuk farki (E7)", () => {
  /**
   * 🔴 E7 ANA KABUKTA ciziliir ve santiye DRILL sekme seridi YOKTUR (E7 30-60);
   * seridi yalniz santiye kapsamli ikiz (GK148-155) cizer. Serit burada
   * basilsaydi kullanici kok rotadayken santiye detayina ait sekmeler gorur ve
   * tiklayinca baska bir kabuga savrulurdu.
   */
  it("santiye drill sekme seridi BASILMAZ", () => {
    render(<GeneralSiteDiaryView />);
    expect(
      screen.queryByRole("tablist", { name: "Şantiye detay sekmeleri" }),
    ).not.toBeInTheDocument();
  });

  /**
   * 🔴 POZITIF KONTROL — yukaridaki iddia, ekran HIC basilmasa da (ornegin
   * bilesen bos donse) yesil kalirdi. Seridin yoklugunun "ekran yok"tan degil
   * KABUK FARKINDAN geldigi ayrica olculur: govdenin kendi serit-disi
   * parcalari basiliyor.
   */
  it("kontrol: serit yok ama EKRANIN KENDISI basiliyor", () => {
    render(<GeneralSiteDiaryView />);
    expect(screen.getByLabelText("Şantiye")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Günlük Kayıt & Planlama",
    );
  });

  it("izin yoksa ortak govde erisim reddi basar (secici de gorunmez)", () => {
    mockSession({ site_diary: "none" });
    render(<GeneralSiteDiaryView />);
    expect(screen.queryByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).not.toBeInTheDocument();
  });
});
