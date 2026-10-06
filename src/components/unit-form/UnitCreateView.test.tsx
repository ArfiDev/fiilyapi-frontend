import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { UnitCreateView } from "./UnitCreateView";
import {
  UNIT_COST_PENDING_REASON,
  UNIT_DOCUMENTS_PENDING_REASON,
  UNIT_EXPECTED_PROFIT_PENDING_REASON,
  UNIT_PROJECT_REQUIRED_MESSAGE,
} from "./constants";
import { UNKNOWN_FLOOR_COUNT_HINT } from "./floor-options";
import { UNIT_FORM_TABS, unitFormTabsPendingReason } from "@/components/unit-shell/routes";
import { useProjectBlocks, type BlockResponse } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useCreateUnit } from "@/lib/api/hooks/useUnitMutations";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjectBlocks", () => ({ useProjectBlocks: vi.fn() }));
vi.mock("@/lib/api/hooks/useUnitMutations", () => ({ useCreateUnit: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

let searchParams = new URLSearchParams();
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/satis/unite-ekle",
  useSearchParams: () => searchParams,
}));

function queryStub(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, error: null, ...extra } as never;
}

function makeBlock(overrides: Partial<BlockResponse> = {}): BlockResponse {
  return {
    id: "blk-b",
    name: "B Blok",
    site_id: "site-1",
    site_name: "Yeşilvadi Şantiyesi",
    floor_count: 8,
    basement_floor_count: 2,
    roof_type: "duplex",
    ...overrides,
  } as BlockResponse;
}

const mutateAsync = vi.fn();

function mockBlocks(...blocks: BlockResponse[]) {
  vi.mocked(useProjectBlocks).mockReturnValue(queryStub({ blocks }));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  mutateAsync.mockResolvedValue({ id: "unt-yeni" });
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
  mockBlocks(
    makeBlock(),
    makeBlock({ id: "blk-c", name: "C Blok", site_id: "site-2", site_name: "2. Etap Şantiyesi" }),
  );
  vi.mocked(useCreateUnit).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
  } as never);
});

function selectProject() {
  fireEvent.change(screen.getByTestId("unite-form-proje"), { target: { value: "prj-1" } });
}

function optionLabels(testId: string): string[] {
  return within(screen.getByTestId(testId))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("UnitCreateView — TAM SAYFA kabuğu (UE 32-58)", () => {
  it("başlık ve breadcrumb basılır (modal DEĞİL)", () => {
    render(<UnitCreateView />);
    expect(
      screen.getByRole("heading", { name: "Ünite Ekle / Düzenle", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Ünite Ekle",
    );
  });

  it("dört kart da basılır (UE 60 · 70 · 85 · 103)", () => {
    render(<UnitCreateView />);
    for (const title of ["Konum", "Ünite Bilgileri", "Fiyatlandırma", "Ünite Belgeleri"]) {
      expect(screen.getByRole("heading", { name: new RegExp(title), level: 2 })).toBeInTheDocument();
    }
  });

  it("Ünite sayfasında (mali.satis_unite) Düzenler yoksa AccessDenied basılır (kardeş satış sayfası Düzenler olsa da)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: { "mali.satis": pageGrant("edit"), "mali.satis_unite": pageGrant("view") } }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<UnitCreateView />);
    expect(screen.queryByTestId("unite-form-govde")).not.toBeInTheDocument();
  });
});

describe("UnitCreateView — DÖRT pending yüzey: devre dışı + GÖRÜNÜR gerekçe", () => {
  it("UE 91 Maliyet devre dışıdır, '—' basar ve gerekçesi EKRANDA", () => {
    render(<UnitCreateView />);
    const cost = screen.getByTestId("unite-form-maliyet");
    expect(cost).toBeDisabled();
    expect(cost).toHaveValue("—");
    expect(screen.getByTestId("unite-form-maliyet-gerekce")).toHaveTextContent(
      UNIT_COST_PENDING_REASON,
    );
  });

  it("UE 97-99 Beklenen Kâr bandı SAYI UYDURMAZ; gerekçe EKRANDA", () => {
    render(<UnitCreateView />);
    const profit = screen.getByTestId("unite-form-kar");
    expect(profit).toHaveTextContent("Beklenen Kâr");
    expect(profit).toHaveTextContent("—");
    // Mockup'ın örnek sayıları (99) BASILMAZ.
    expect(profit).not.toHaveTextContent("500.000");
    expect(profit).not.toHaveTextContent("33,8");
    expect(screen.getByTestId("unite-form-kar-gerekce")).toHaveTextContent(
      UNIT_EXPECTED_PROFIT_PENDING_REASON,
    );
  });

  it("UE 103-122 belge kartı üç kutuyu devre dışı basar; gerekçe EKRANDA", () => {
    render(<UnitCreateView />);
    expect(screen.getByText(UNIT_DOCUMENTS_PENDING_REASON)).toBeInTheDocument();
    for (const title of ["Kat Planı", "Görseller / Render", "Kat İrtifakı Tapusu"]) {
      expect(screen.getByText(title), title).toBeInTheDocument();
    }
    // Gerçek yükleme YOK: hiçbir dosya girdisi render edilmez.
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });

  it("UE 52-54 rotası YAZILMAMIŞ sekmeler devre dışıdır ve gerekçeleri EKRANDA", () => {
    // 🔴 Liste SABİT DEĞİL: F-UNIT2 sekmeleri tek tek canlandırdıkça küme
    // küçülür. Sabit üçlü yazılsaydı bu iddia canlı bir sekmeyi "devre dışı"
    // sanarak kırmızıya düşerdi.
    render(<UnitCreateView />);
    const pending = UNIT_FORM_TABS.filter((tab) => tab.href === undefined);
    for (const tab of pending) {
      expect(screen.getByRole("tab", { name: tab.label }), tab.label).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    const reason = unitFormTabsPendingReason();
    expect(screen.queryByTestId("unite-form-sekme-gerekce") !== null).toBe(reason !== null);
    if (reason !== null) {
      expect(screen.getByTestId("unite-form-sekme-gerekce")).toHaveTextContent(reason);
    }
  });

  it("UE 50 'Blok Ekle' sekmesi GERÇEK rotaya bağlıdır", () => {
    render(<UnitCreateView />);
    expect(screen.getByRole("tab", { name: "Blok Ekle" })).toHaveAttribute(
      "href",
      "/satis/blok-ekle",
    );
  });
});

describe("UnitCreateView — kaskad: proje → şantiye (süzgeç) → blok", () => {
  it("proje seçilmeden blok seçicisi kapalıdır ve gerekçe GÖRÜNÜR", () => {
    render(<UnitCreateView />);
    expect(screen.getByTestId("unite-form-blok")).toBeDisabled();
    expect(screen.getByTestId("unite-form-blok-uyari")).toHaveTextContent("Önce bir proje seçin");
  });

  it("şantiye seçilmeden projenin TÜM blokları listelenir", () => {
    render(<UnitCreateView />);
    selectProject();
    expect(optionLabels("unite-form-blok")).toEqual(["Seçiniz...", "B Blok", "C Blok"]);
  });

  it("şantiye süzgeci blok listesini DARALTIR (UE 64 — gövdeye girmez)", () => {
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-santiye"), { target: { value: "site-2" } });
    expect(optionLabels("unite-form-blok")).toEqual(["Seçiniz...", "C Blok"]);
  });

  it("şantiye DEĞİŞİNCE seçili blok ve kat sıfırlanır", () => {
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    fireEvent.change(screen.getByTestId("unite-form-kat"), { target: { value: "3. Kat" } });
    fireEvent.change(screen.getByTestId("unite-form-santiye"), { target: { value: "site-2" } });
    expect(screen.getByTestId("unite-form-blok")).toHaveValue("");
    expect(screen.getByTestId("unite-form-kat")).toHaveValue("");
  });

  // kalan-6 no 338 — proje/şantiye değişiminde `floor` sıfırlanıyordu ama
  // BLOK doğrudan değiştirildiğinde (genel `onChangeField("blockId", …)`)
  // hiçbir özel işleyici yoktu; eski bloğun katı kalıyor, kutu BOŞ görünse
  // de `touched.has("floor")` doğru olduğu için build-body gövdeye yazıyordu.
  it("BLOK doğrudan değişince de seçili kat sıfırlanır", () => {
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    fireEvent.change(screen.getByTestId("unite-form-kat"), { target: { value: "3. Kat" } });
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-c" } });
    expect(screen.getByTestId("unite-form-kat")).toHaveValue("");
  });

  it("proje seçimi URL'ye yazılır", () => {
    render(<UnitCreateView />);
    selectProject();
    expect(replaceMock).toHaveBeenCalledWith("/satis/unite-ekle?proje=prj-1", { scroll: false });
  });
});

describe("UnitCreateView — UE 66 Kat listesi SEÇİLİ BLOKTAN türer", () => {
  it("blok seçilmeden kat seçicisi kapalıdır ve gerekçe GÖRÜNÜR", () => {
    render(<UnitCreateView />);
    selectProject();
    expect(screen.getByTestId("unite-form-kat")).toBeDisabled();
    expect(screen.getByText(/önce blok seçin/i)).toBeInTheDocument();
  });

  it("2 bodrum · 8 kat · dubleks blok TAM listeyi verir", () => {
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    expect(optionLabels("unite-form-kat")).toEqual([
      "Seçiniz...",
      "2. Bodrum",
      "1. Bodrum",
      "Zemin",
      "1. Kat",
      "2. Kat",
      "3. Kat",
      "4. Kat",
      "5. Kat",
      "6. Kat",
      "7. Kat",
      "8. Kat",
      "Çatı Katı",
    ]);
  });

  it("🔴 bloğun OLMAYAN katı teklif EDİLMEZ (mockup'ın sabit listesi kullanılmaz)", () => {
    mockBlocks(makeBlock({ floor_count: 2, basement_floor_count: 0, roof_type: "none" }));
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    const labels = optionLabels("unite-form-kat");
    expect(labels).toEqual(["Seçiniz...", "Zemin", "1. Kat", "2. Kat"]);
    // Mockup UE 66'da "3. Kat" ve "Çatı Katı" ÇİZİLİDİR — bu blokta ikisi de yok.
    expect(labels).not.toContain("3. Kat");
    expect(labels).not.toContain("Çatı Katı");
  });

  it("kat sayısı BİLİNMEYEN blokta aralık UYDURULMAZ; gerekçe GÖRÜNÜR", () => {
    mockBlocks(makeBlock({ floor_count: null, basement_floor_count: null, roof_type: null }));
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    expect(optionLabels("unite-form-kat")).toEqual(["Seçiniz...", "Zemin"]);
    expect(screen.getByText(UNKNOWN_FLOOR_COUNT_HINT)).toBeInTheDocument();
  });
});

describe("UnitCreateView — UE 89 m² birim fiyat CANLI türev (sunucu pariteli)", () => {
  it("liste fiyatı ve brüt m² dolunca hesaplanır (float kalıntısı YOK)", () => {
    render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-liste-fiyat"), {
      target: { value: "1480000" },
    });
    fireEvent.change(screen.getByTestId("unite-form-brut"), { target: { value: "178" } });
    // Sunucu `unit_price_per_m2` alanında 8314.61 döner; ekran aynı sayıyı basar.
    expect(screen.getByTestId("unite-form-m2-fiyat")).toHaveValue("8.314,61");
  });

  it("brüt m² boş/sıfırken '—' basar (sıfıra bölünmez)", () => {
    render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-liste-fiyat"), {
      target: { value: "1480000" },
    });
    expect(screen.getByTestId("unite-form-m2-fiyat")).toHaveValue("—");
    fireEvent.change(screen.getByTestId("unite-form-brut"), { target: { value: "0" } });
    expect(screen.getByTestId("unite-form-m2-fiyat")).toHaveValue("—");
  });

  it("NET m² kutusu bu türevi DEĞİŞTİRMEZ (taban BRÜT'tür — UE 89 ipucu)", () => {
    render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-liste-fiyat"), {
      target: { value: "1480000" },
    });
    fireEvent.change(screen.getByTestId("unite-form-brut"), { target: { value: "178" } });
    fireEvent.change(screen.getByTestId("unite-form-net"), { target: { value: "100" } });
    expect(screen.getByTestId("unite-form-m2-fiyat")).toHaveValue("8.314,61");
  });
});

describe("UnitCreateView — UE 78 Cephe: enum'un BEŞ değeri de ULAŞILABİLİR", () => {
  it("mockup dört seçenek çizse de seçicide beş vardır (Batı dahil)", () => {
    render(<UnitCreateView />);
    expect(optionLabels("unite-form-cephe")).toEqual([
      "Güney",
      "Güney-Batı",
      "Doğu",
      "Kuzey",
      "Batı",
    ]);
  });
});

describe("UnitCreateView — kaydetme", () => {
  function fillMinimalUnit() {
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    fireEvent.change(screen.getByTestId("unite-form-kat"), { target: { value: "3. Kat" } });
    fireEvent.change(screen.getByTestId("unite-form-no"), { target: { value: " B-12 " } });
    fireEvent.change(screen.getByTestId("unite-form-brut"), { target: { value: "178" } });
    fireEvent.change(screen.getByTestId("unite-form-liste-fiyat"), {
      target: { value: "1480000,00" },
    });
  }

  it("dolu form beklenen gövdeyi POST eder ve listeye döner", async () => {
    render(<UnitCreateView />);
    fillMinimalUnit();
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(mutateAsync).toHaveBeenCalledWith({
      projectId: "prj-1",
      body: {
        block_id: "blk-b",
        unit_no: "B-12",
        unit_kind: "apartment",
        sort_order: 0,
        sales_status: "listed",
        floor: "3. Kat",
        gross_area_m2: "178",
        list_price: "1480000.00",
      },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/satis"));
  });

  it("🔴 gövdede maliyet/kâr/belge/şantiye/proje anahtarı YOKTUR", async () => {
    render(<UnitCreateView />);
    fillMinimalUnit();
    fireEvent.change(screen.getByTestId("unite-form-santiye"), { target: { value: "site-1" } });
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    const body = mutateAsync.mock.calls[0][0].body as Record<string, unknown>;
    for (const forbidden of [
      "cost",
      "unit_cost",
      "expected_profit",
      "documents",
      "site_id",
      "project_id",
    ]) {
      expect(body, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("dokunulmamış seçicilerin varsayılanı gövdeye SIZMAZ", async () => {
    render(<UnitCreateView />);
    selectProject();
    fireEvent.change(screen.getByTestId("unite-form-no"), { target: { value: "B-1" } });
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    // Ekranda "Güney-Batı" / "%10" / "Yüklenici (Biz)" görünür ama kullanıcı
    // hiçbirini AÇMADI — sütunlar NULL kalır.
    expect(mutateAsync.mock.calls[0][0].body).toEqual({
      block_id: "",
      unit_no: "B-1",
      unit_kind: "apartment",
      sort_order: 0,
      sales_status: "listed",
    });
  });

  it("'Kaydet & Yeni Ekle' listeye DÖNMEZ; konumu korur, alanları temizler", async () => {
    render(<UnitCreateView />);
    fillMinimalUnit();
    fireEvent.click(screen.getByTestId("unite-form-kaydet-yeni"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(pushMock).not.toHaveBeenCalled();
    expect(await screen.findByTestId("unite-form-kayit-notu")).toHaveTextContent("B-12");
    // Konum korunur (aynı katta arka arkaya ünite girmek bu formun asıl işi).
    expect(screen.getByTestId("unite-form-blok")).toHaveValue("blk-b");
    expect(screen.getByTestId("unite-form-kat")).toHaveValue("3. Kat");
    // Ünitenin kendi alanları temizlenir.
    expect(screen.getByTestId("unite-form-no")).toHaveValue("");
    expect(screen.getByTestId("unite-form-liste-fiyat")).toHaveValue("");
  });

  it("proje seçilmeden kaydetmeye çalışmak istek KURMAZ, görünür gerekçe basar", async () => {
    render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-no"), { target: { value: "B-12" } });
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByTestId("unite-form-hata")).toHaveTextContent(
      UNIT_PROJECT_REQUIRED_MESSAGE,
    );
  });

  it("sunucu hatası OLDUĞU GİBİ basılır; listeye yönlendirme YAPILMAZ", async () => {
    mutateAsync.mockRejectedValue(new BackendError(404, { detail: "Blok bulunamadı." }));
    render(<UnitCreateView />);
    fillMinimalUnit();
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    expect(await screen.findByTestId("unite-form-hata")).toHaveTextContent("Blok bulunamadı.");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("UnitCreateView — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false (`touched` boş)", () => {
    render(<UnitCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan dokunuldu → true", () => {
    render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-no"), { target: { value: "B-12" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: router.push) → unmount ile false", async () => {
    const { unmount } = render(<UnitCreateView />);
    fireEvent.change(screen.getByTestId("unite-form-proje"), { target: { value: "prj-1" } });
    fireEvent.change(screen.getByTestId("unite-form-blok"), { target: { value: "blk-b" } });
    fireEvent.change(screen.getByTestId("unite-form-kat"), { target: { value: "3. Kat" } });
    fireEvent.change(screen.getByTestId("unite-form-no"), { target: { value: "B-12" } });
    fireEvent.change(screen.getByTestId("unite-form-brut"), { target: { value: "178" } });
    fireEvent.change(screen.getByTestId("unite-form-liste-fiyat"), { target: { value: "1480000,00" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("unite-form-kaydet"));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    // Gerçek uygulamada `router.push` sayfayı değiştirir (unmount); testte
    // bu, `pushMock` yalnızca çağrıyı kaydettiği için ELLE simüle edilir.
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
