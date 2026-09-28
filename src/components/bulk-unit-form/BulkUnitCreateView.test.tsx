import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BulkUnitCreateView } from "./BulkUnitCreateView";
import {
  BULK_CONFLICT_HINT,
  BULK_PREVIEW_EMPTY_NOTICE,
  BULK_PROJECT_REQUIRED_MESSAGE,
  BULK_SLOT_EMPTY_NOTICE,
  BULK_UNIT_COST_PENDING_REASON,
} from "./constants";
import { ROOF_FLOOR_SENTINEL } from "./floor-range";
import { useProjectBlocks, type BlockResponse } from "@/lib/api/hooks/useProjectBlocks";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import {
  useBulkUnitPreview,
  useCreateBulkUnits,
  type UnitBulkPreview,
} from "@/lib/api/hooks/useUnitBulk";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjectBlocks", () => ({ useProjectBlocks: vi.fn() }));
vi.mock("@/lib/api/hooks/useUnitBulk", () => ({
  useBulkUnitPreview: vi.fn(),
  useCreateBulkUnits: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

let searchParams = new URLSearchParams();
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/satis/toplu-uretim",
  useSearchParams: () => searchParams,
}));

function queryStub(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, error: null, ...extra } as never;
}

function makeBlock(overrides: Partial<BlockResponse> = {}): BlockResponse {
  return {
    id: "blk-c",
    name: "C Blok",
    site_id: "site-1",
    site_name: "Yeşilvadi Şantiyesi",
    floor_count: 8,
    basement_floor_count: 0,
    roof_type: "duplex",
    ...overrides,
  } as BlockResponse;
}

function makePreview(overrides: Partial<UnitBulkPreview> = {}): UnitBulkPreview {
  return {
    total_units: 2,
    total_list_value: "2220000.00",
    conflicting_unit_nos: ["C-1"],
    rows: [
      {
        unit_no: "C-1",
        floor: 1,
        floor_label: "1. Kat",
        layout: "3+1",
        gross_area_m2: "148",
        net_area_m2: "128",
        facing: "south",
        list_price: "1280000.00",
        conflict: true,
      },
      {
        unit_no: "C-2",
        floor: 1,
        floor_label: "1. Kat",
        layout: "2+1",
        gross_area_m2: "112",
        net_area_m2: "96",
        facing: "east",
        list_price: "940000.00",
        conflict: false,
      },
    ],
    ...overrides,
  };
}

const previewAsync = vi.fn();
const createAsync = vi.fn();

function mockBlocks(...blocks: BlockResponse[]) {
  vi.mocked(useProjectBlocks).mockReturnValue(queryStub({ blocks }));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  previewAsync.mockResolvedValue(makePreview());
  createAsync.mockResolvedValue({ blocks: [] });
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { projects: "full" } } as unknown as MeResponse,
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
    makeBlock({ id: "blk-a", name: "A Blok", site_id: "site-2", site_name: "2. Etap Şantiyesi" }),
  );
  vi.mocked(useBulkUnitPreview).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: previewAsync,
    isPending: false,
  } as never);
  vi.mocked(useCreateBulkUnits).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: createAsync,
    isPending: false,
  } as never);
});

function selectProject() {
  fireEvent.change(screen.getByTestId("toplu-form-proje"), { target: { value: "prj-1" } });
}

function selectBlock(blockId = "blk-c") {
  fireEvent.change(screen.getByTestId("toplu-form-blok"), { target: { value: blockId } });
}

/** TU 70-72 — geçerli bir üretim kuralı: 1. Kat → 8. Kat, katta 3 daire. */
function fillRules() {
  fireEvent.change(screen.getByTestId("toplu-form-baslangic-kat"), { target: { value: "1" } });
  fireEvent.change(screen.getByTestId("toplu-form-bitis-kat"), { target: { value: "8" } });
  fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "3" } });
}

function fillTarget() {
  selectProject();
  selectBlock();
  fillRules();
  // 🔴 KUSUR no 44 fix: TU 137 kutucuğu VARSAYILAN İŞARETLİDİR (mockup); boş
  // yüzdeyle gönderim artık ENGELLENİR. Kutucuğun KENDİSİ dokunulmaz kalır
  // (varsayılan işaretli davranışını test eden senaryolar bozulmasın diye);
  // geçerli bir gönderim için yüzde alanı doldurulur.
  fireEvent.change(screen.getByTestId("toplu-form-artis-yuzde"), { target: { value: "5" } });
}

function optionLabels(testId: string): string[] {
  return within(screen.getByTestId(testId))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

function slotRows() {
  return screen.queryAllByTestId("toplu-form-sablon-satir");
}

describe("BulkUnitCreateView — TAM SAYFA kabuğu (TU 31-56)", () => {
  it("başlık ve breadcrumb basılır (modal DEĞİL)", () => {
    render(<BulkUnitCreateView />);
    expect(
      screen.getByRole("heading", { name: "Toplu Ünite Üretimi", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Toplu Ünite Üretimi",
    );
  });

  it("dört kart + dikkat şeridi basılır (TU 58 · 67 · 91 · 143 · 176)", () => {
    render(<BulkUnitCreateView />);
    for (const title of [
      "Hedef Blok",
      "Üretim Kuralları",
      "Kat Şablonu",
      "Üretim Önizlemesi",
    ]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(title), level: 2 }),
        title,
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId("toplu-form-uyari")).toHaveTextContent("Dikkat");
  });

  it("TU 50 sekmesi AKTİF basılır (şerit ailenin ortak bileşeni)", () => {
    render(<BulkUnitCreateView />);
    expect(screen.getByRole("tab", { name: "Toplu Üretim" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Ünite Ekle" })).toHaveAttribute(
      "href",
      "/satis/unite-ekle",
    );
  });

  it("İptal bir GEZİNMEDİR (TU 39/181 `<a href>`) — düğme değil", () => {
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-iptal")).toHaveAttribute("href", "/satis");
    expect(screen.getByTestId("toplu-form-iptal-ust")).toHaveAttribute("href", "/satis");
  });

  it("`projects` yetkisi yoksa AccessDenied basılır (`sales` DEĞİL)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { projects: "none", sales: "full" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<BulkUnitCreateView />);
    expect(screen.queryByTestId("toplu-form-govde")).not.toBeInTheDocument();
  });

  it("`projects` yetkisi `draft` iken AccessDenied basılır (sunucu yalnız `full` ister)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { projects: "draft" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<BulkUnitCreateView />);
    expect(screen.queryByTestId("toplu-form-govde")).not.toBeInTheDocument();
  });

  it("blok listesi 403 dönerse yetki gerekçesi GÖRÜNÜR basılır", () => {
    vi.mocked(useProjectBlocks).mockReturnValue(
      queryStub(undefined, {
        isError: true,
        error: new BackendError(403, { detail: "Yetkisiz" }),
      }),
    );
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-blok-uyari")).toHaveTextContent(
      "Blok listesi için proje yetkisi gerekiyor.",
    );
  });
});

describe("BulkUnitCreateView — kaskad: proje → şantiye (süzgeç) → blok", () => {
  it("proje seçilmeden blok seçicisi kapalıdır ve gerekçe GÖRÜNÜR", () => {
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-blok")).toBeDisabled();
    expect(screen.getByTestId("toplu-form-blok-uyari")).toHaveTextContent("Önce bir proje seçin");
  });

  it("şantiye süzgeci blok listesini DARALTIR (TU 62 — gövdeye girmez)", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    expect(optionLabels("toplu-form-blok")).toEqual(["Seçiniz...", "C Blok", "A Blok"]);
    fireEvent.change(screen.getByTestId("toplu-form-santiye"), { target: { value: "site-2" } });
    expect(optionLabels("toplu-form-blok")).toEqual(["Seçiniz...", "A Blok"]);
  });

  it("proje seçimi URL'ye yazılır (`?proje=`)", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    expect(replaceMock).toHaveBeenCalledWith("/satis/toplu-uretim?proje=prj-1", {
      scroll: false,
    });
  });

  it("`?proje=` bağlamı formu TOHUMLAR", () => {
    searchParams = new URLSearchParams("proje=prj-1");
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-proje")).toHaveValue("prj-1");
  });

  it("🔴 `?blok=` bağlamı da TOHUMLANIR — BE 109'un geldiği yer burasıdır", () => {
    // `BlockCreateView` "Kaydettikten sonra toplu ünite üretimine geç"
    // işaretliyken buraya `?proje=…&blok=<yeni blok>` ile yönlendirir. `blok`
    // okunmazsa kullanıcı blok seçicisi BOŞ bir ekrana düşer ve o kutucuk
    // süsten ibaret kalırdı.
    searchParams = new URLSearchParams("proje=prj-1&blok=blk-a");
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-proje")).toHaveValue("prj-1");
    expect(screen.getByTestId("toplu-form-blok")).toHaveValue("blk-a");
  });
});

describe("BulkUnitCreateView — TU 70/71 kat aralığı SEÇİLİ BLOKTAN türer", () => {
  it("blok seçilmeden kat seçicileri kapalıdır ve gerekçe GÖRÜNÜR", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    expect(screen.getByTestId("toplu-form-baslangic-kat")).toBeDisabled();
    expect(screen.getByTestId("toplu-form-bitis-kat")).toBeDisabled();
    expect(screen.getByText(/önce blok seçin/i)).toBeInTheDocument();
  });

  it("bitiş katı listesinde 'Çatı Katı' vardır, başlangıçta YOKTUR", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    expect(optionLabels("toplu-form-bitis-kat")).toContain("Çatı Katı");
    expect(optionLabels("toplu-form-baslangic-kat")).not.toContain("Çatı Katı");
  });

  it("🔴 bloğun OLMAYAN katı teklif EDİLMEZ (mockup'ın sabit listesi kullanılmaz)", () => {
    mockBlocks(makeBlock({ floor_count: 2, basement_floor_count: 0, roof_type: "none" }));
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    expect(optionLabels("toplu-form-baslangic-kat")).toEqual([
      "Seçiniz...",
      "Zemin",
      "1. Kat",
      "2. Kat",
    ]);
    expect(optionLabels("toplu-form-bitis-kat")).not.toContain("Çatı Katı");
  });
});

describe("BulkUnitCreateView — TU 73 'Toplam Üretilecek' CANLI TÜREV", () => {
  it("türev sunucu formülüyle aynı sayıyı basar (8 kat × 3 = 24)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    expect(screen.getByTestId("toplu-form-toplam")).toHaveValue("24 ünite");
  });

  it("🔴 `readOnly`dır, `disabled` DEĞİL (UE 89 ayrımı: canlı türev ≠ bekleyen yüzey)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    const box = screen.getByTestId("toplu-form-toplam");
    // DOM ÖZELLİĞİ ölçülür — `readonly` özniteliği ile `disabled` KARIŞTIRILMAZ.
    expect((box as HTMLInputElement).readOnly).toBe(true);
    expect(box).not.toBeDisabled();
  });

  it("çatı turu sayıya DAHİLDİR (8 kat + çatı = 9 tur × 3 = 27)", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    fireEvent.change(screen.getByTestId("toplu-form-baslangic-kat"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("toplu-form-bitis-kat"), {
      target: { value: ROOF_FLOOR_SENTINEL },
    });
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "3" } });
    expect(screen.getByTestId("toplu-form-toplam")).toHaveValue("27 ünite");
  });

  it("geçersiz aralıkta sayı UYDURULMAZ; gerekçe GÖRÜNÜR", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    fireEvent.change(screen.getByTestId("toplu-form-baslangic-kat"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("toplu-form-bitis-kat"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "3" } });
    expect(screen.getByTestId("toplu-form-toplam")).toHaveValue("—");
    expect(
      screen.getByText("Bitiş katı başlangıç katından küçük olamaz"),
    ).toBeInTheDocument();
  });

  it("kaydet düğmesi TÜREV sayıyı taşır (TU 40/183); sayı yokken sayısız etikete düşer", () => {
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-olustur")).toHaveTextContent("Üniteleri Oluştur");
    fillTarget();
    expect(screen.getByTestId("toplu-form-olustur")).toHaveTextContent("24 Üniteyi Oluştur");
  });
});

describe("BulkUnitCreateView — TU 90-140 Kat Şablonu satırları KİLİTLİ", () => {
  it("daire sayısı girilmeden tablo BOŞ değil, gerekçelidir", () => {
    render(<BulkUnitCreateView />);
    expect(slotRows()).toHaveLength(0);
    expect(screen.getByTestId("toplu-form-sablon-bos")).toHaveTextContent(
      BULK_SLOT_EMPTY_NOTICE,
    );
  });

  it("🔴 satır sayısı `units_per_floor` ile hareket eder (3 → 5)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    expect(slotRows()).toHaveLength(3);
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "5" } });
    expect(slotRows()).toHaveLength(5);
  });

  it("🔴 küçülme YAZILAN veriyi kaybettirmez (5 → 2, ilk iki satır korunur)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("toplu-form-brut-1"), { target: { value: "148" } });
    fireEvent.change(screen.getByTestId("toplu-form-brut-2"), { target: { value: "112" } });
    fireEvent.change(screen.getByTestId("toplu-form-liste-fiyat-2"), {
      target: { value: "940000" },
    });

    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "2" } });
    expect(slotRows()).toHaveLength(2);
    expect(screen.getByTestId("toplu-form-brut-1")).toHaveValue("148");
    expect(screen.getByTestId("toplu-form-brut-2")).toHaveValue("112");
    expect(screen.getByTestId("toplu-form-liste-fiyat-2")).toHaveValue("940000");
  });

  it("🔴 TU 104 Maliyet sütunu DEVRE DIŞIdır ve gerekçesi EKRANDA (title'da değil)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    const cost = screen.getByTestId("toplu-form-maliyet-1");
    expect(cost).toBeDisabled();
    expect(cost).toHaveValue("—");
    expect(screen.getByTestId("toplu-form-maliyet-gerekce")).toHaveTextContent(
      BULK_UNIT_COST_PENDING_REASON,
    );
    // Gerekçe metin olarak da BULUNUR — `title`da saklanmış değildir.
    expect(screen.getByText(BULK_UNIT_COST_PENDING_REASON)).toBeInTheDocument();
  });

  it("TU 137 kutucuğu kapatılınca yüzde kutusu da kapanır (kapı semantiği)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    expect(screen.getByTestId("toplu-form-artis-yuzde")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("toplu-form-fiyat-artisi"));
    expect(screen.getByTestId("toplu-form-artis-yuzde")).toBeDisabled();
  });
});

describe("BulkUnitCreateView — enum'ların TAM kümesi ULAŞILABİLİR", () => {
  it("TU 79 dört desen çizse de seçicide BEŞ vardır (`sequential` dahil)", () => {
    render(<BulkUnitCreateView />);
    expect(optionLabels("toplu-form-numaralandirma")).toHaveLength(5);
    expect(optionLabels("toplu-form-numaralandirma").at(-1)).toContain("{Sıra}");
  });

  it("TU 112 dört cephe çizse de satırda BEŞ vardır (Batı dahil)", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    expect(optionLabels("toplu-form-cephe-1")).toEqual([
      "Güney",
      "Güney-Batı",
      "Doğu",
      "Kuzey",
      "Batı",
    ]);
  });

  it("MOCKUP + BİR: `unit_kind` seçicisi vardır ve beş türü de sunar", () => {
    render(<BulkUnitCreateView />);
    expect(optionLabels("toplu-form-unite-turu")).toEqual([
      "Daire",
      "Dükkan / Ticari",
      "Ofis",
      "Depo",
      "Otopark",
    ]);
  });
});

describe("BulkUnitCreateView — TU 182 Önizleme (yazmaz, denetim üretmez)", () => {
  it("kart ilk açılışta BOŞ değil, gerekçelidir", () => {
    render(<BulkUnitCreateView />);
    expect(screen.getByTestId("toplu-form-onizleme-bos")).toHaveTextContent(
      BULK_PREVIEW_EMPTY_NOTICE,
    );
  });

  it("önizleme ucu ÇAĞRILIR ve satırlar basılır", async () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    await waitFor(() => expect(previewAsync).toHaveBeenCalled());

    expect(previewAsync.mock.calls[0][0].projectId).toBe("prj-1");
    expect(await screen.findByTestId("toplu-form-onizleme-tablo")).toBeInTheDocument();
    expect(screen.getAllByTestId("toplu-form-onizleme-satir")).toHaveLength(2);
    // 🔴 Kaydetme ucu ÇAĞRILMAZ: önizleme hiçbir şey yazmaz.
    expect(createAsync).not.toHaveBeenCalled();
  });

  it("🔴 toplamlar SUNUCUDAN basılır — istemci para hesaplamaz", async () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    // Sunucu 2 ünite / ₺2.220.000 dedi; ekranda TU 73'ün türevi (24) DEĞİL,
    // sunucunun sayısı görünür.
    expect(await screen.findByTestId("toplu-form-onizleme-toplam")).toHaveTextContent(
      "₺2.220.000",
    );
    expect(screen.getByTestId("toplu-form-onizleme-ozet")).toHaveTextContent(
      "2 ünite oluşturulacak",
    );
  });

  it("🔴 `conflict: true` satırı GÖRÜNÜR işaretlenir (uyarı, hata DEĞİL)", async () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    const rows = await screen.findAllByTestId("toplu-form-onizleme-satir");

    expect(within(rows[0]).getByText("Çakışma")).toBeInTheDocument();
    expect(rows[0].className).toContain("tu-preview-row--conflict");
    expect(within(rows[1]).queryByText("Çakışma")).toBeNull();
    // Çakışma bir HATA yüzeyi değildir: hata şeridi basılmaz.
    expect(screen.queryByTestId("toplu-form-onizleme-hata")).toBeNull();
    expect(screen.getByTestId("toplu-form-onizleme-cakisma")).toHaveTextContent("C-1");
  });

  it("kurallar değişince önizleme ATILIR (bayat tablo gösterilmez)", async () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    await screen.findByTestId("toplu-form-onizleme-tablo");

    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "4" } });
    expect(screen.queryByTestId("toplu-form-onizleme-tablo")).toBeNull();
    expect(screen.getByTestId("toplu-form-onizleme-bos")).toHaveTextContent(
      "önizleme temizlendi",
    );
  });

  it("proje seçilmeden önizleme istek KURMAZ, gerekçe basar", () => {
    render(<BulkUnitCreateView />);
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    expect(previewAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("toplu-form-onizleme-hata")).toHaveTextContent(
      BULK_PROJECT_REQUIRED_MESSAGE,
    );
  });

  it("sunucu hatası OLDUĞU GİBİ basılır", async () => {
    previewAsync.mockRejectedValue(
      new BackendError(422, { detail: "Tek seferde en fazla 500 ünite üretilebilir" }),
    );
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-onizle"));
    expect(await screen.findByTestId("toplu-form-onizleme-hata")).toHaveTextContent(
      "Tek seferde en fazla 500 ünite üretilebilir",
    );
  });
});

describe("BulkUnitCreateView — TU 40/183 üretim (HEP-YA-HİÇ)", () => {
  it("dolu form beklenen gövdeyi POST eder ve listeye döner", async () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    await waitFor(() => expect(createAsync).toHaveBeenCalled());

    expect(createAsync).toHaveBeenCalledWith({
      projectId: "prj-1",
      body: {
        block_id: "blk-c",
        unit_kind: "apartment",
        start_floor: 1,
        end_floor: 8,
        roof_floor: false,
        units_per_floor: 3,
        numbering: "block_sequence",
        prefix: "",
        start_number: 1,
        // 🔴 KUSUR no 44 fix: `fillTarget()` artık geçerli bir gönderim için
        // yüzdeyi doldurur (kutucuk varsayılan işaretlidir).
        floor_price_increase_pct: "5",
      },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/satis"));
  });

  it("🔴 GÖVDEDE maliyet/şantiye/proje anahtarı YOKTUR (kablolama bekçisi)", async () => {
    render(<BulkUnitCreateView />);
    selectProject();
    // Şantiye AÇIKÇA seçilir: süzgeç gövdeye sızmamalı.
    fireEvent.change(screen.getByTestId("toplu-form-santiye"), { target: { value: "site-1" } });
    selectBlock();
    fillRules();
    // Kat şablonuna gerçek veri yazılır ki `slots` gövdeye girsin.
    fireEvent.change(screen.getByTestId("toplu-form-brut-1"), { target: { value: "148" } });
    // 🔴 KUSUR no 44 fix: kutucuk varsayılan işaretli — yüzde doldurulmadan
    // gönderim engellenir.
    fireEvent.change(screen.getByTestId("toplu-form-artis-yuzde"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    await waitFor(() => expect(createAsync).toHaveBeenCalled());

    const body = createAsync.mock.calls[0][0].body as Record<string, unknown>;
    for (const forbidden of ["cost", "unit_cost", "maliyet", "site_id", "project_id"]) {
      expect(body, forbidden).not.toHaveProperty(forbidden);
    }
    // Slot satırlarında da maliyet anahtarı OLAMAZ.
    expect(JSON.stringify(body)).not.toMatch(/cost|maliyet|site_id|project_id/i);
    expect(body).toHaveProperty("slots");
  });

  it("🔴 409 HEP-YA-HİÇ anlamıyla basılır (yutulmaz, genel hataya indirgenmez)", async () => {
    createAsync.mockRejectedValue(
      new BackendError(409, {
        detail: "Üretilecek ünite numaralarından bazıları blokta zaten var: C-1, C-2",
      }),
    );
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));

    const error = await screen.findByTestId("toplu-form-hata");
    // Sunucunun gövdesi OLDUĞU GİBİ görünür…
    expect(error).toHaveTextContent("blokta zaten var: C-1, C-2");
    // …ve "hiçbiri yazılmadı" anlamı EKLENİR (sunucu bunu söylemez).
    expect(error).toHaveTextContent(BULK_CONFLICT_HINT);
    expect(error).toHaveTextContent("Hiçbir ünite yazılmadı");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("409 DIŞINDAKİ hataya hep-ya-hiç cümlesi EKLENMEZ", async () => {
    createAsync.mockRejectedValue(new BackendError(404, { detail: "Blok bulunamadı." }));
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));

    const error = await screen.findByTestId("toplu-form-hata");
    expect(error).toHaveTextContent("Blok bulunamadı.");
    expect(error).not.toHaveTextContent(BULK_CONFLICT_HINT);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("blok seçilmeden kaydetmeye çalışmak istek KURMAZ", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    expect(createAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("toplu-form-hata")).toHaveTextContent("Önce hedef bloğu seçin.");
  });

  it("🔴 KUSUR no 39: kat şablonunda geçersiz ondalık varken kaydetmeye çalışmak istek KURMAZ", () => {
    render(<BulkUnitCreateView />);
    fillTarget();
    fireEvent.change(screen.getByTestId("toplu-form-brut-1"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    expect(createAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("toplu-form-hata")).toHaveTextContent(
      "Kat şablonunda geçersiz sayı var",
    );
    // Hücrenin kendisi de GÖRÜNÜR biçimde işaretlenir (sessiz düşme yok).
    expect(screen.getByTestId("toplu-form-brut-1")).toHaveAttribute("aria-invalid", "true");
  });

  // 🔴 KULLANICI KARARI (2026-09-23): boş yüzde = ARTIŞ YOK; akış ENGELLENMEZ.
  // İlk onarım turu engellemişti ve form varsayılan hâliyle (kutucuk mockup
  // gereği işaretli, yüzde boş) KİLİTLİ doğuyordu — e2e'de toplu üretim akışı
  // tamamen durdu. Kusur "ekranın yalan söylemesi"ydi; çözüm ekranı DOĞRU
  // konuşturmak, kapı koymak değil.
  it("🔴 KUSUR no 44: kutucuk işaretli + yüzde boş → NOT basılır, istek KURULUR, gövde artış TAŞIMAZ", async () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    fillRules();
    // fillTarget() KULLANILMAZ: yüzde BİLEREK boş bırakılır.
    expect(screen.getByTestId("toplu-form-artis-bos-notu")).toHaveTextContent(
      "UYGULANMAYACAK",
    );
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    await waitFor(() => expect(createAsync).toHaveBeenCalled());
    const body = createAsync.mock.calls[0][0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("floor_price_increase_pct");
  });

  it("🔴 yüzde DOLUNCA not KAYBOLUR (ekran durumu izler)", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    fillRules();
    expect(screen.getByTestId("toplu-form-artis-bos-notu")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("toplu-form-artis-yuzde"), { target: { value: "5" } });
    expect(screen.queryByTestId("toplu-form-artis-bos-notu")).not.toBeInTheDocument();
  });

  it("🔴 KUSUR no 44: kutucuk kapatılırsa boş yüzde ARTIK sorun DEĞİLDİR", async () => {
    render(<BulkUnitCreateView />);
    selectProject();
    selectBlock();
    fillRules();
    fireEvent.click(screen.getByTestId("toplu-form-fiyat-artisi")); // kapat
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    await waitFor(() => expect(createAsync).toHaveBeenCalled());
    const body = createAsync.mock.calls[0][0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("floor_price_increase_pct");
  });
});

/** SEKME-F1.3b · merkezi kayda bağlanma bekçisi. */
describe("BulkUnitCreateView — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı, dokunulmadı → temiz", () => {
    render(<BulkUnitCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir alan değiştirildi → kirli", () => {
    render(<BulkUnitCreateView />);
    selectProject();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt sonrası (router.push unmount eder) → temiz", async () => {
    const { unmount } = render(<BulkUnitCreateView />);
    fillTarget();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("toplu-form-olustur"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/satis"));
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  /**
   * SEKME-F1.6-Y1 — gerçek yol: `BlockCreateView` "Kaydettikten sonra toplu
   * üretime geç" ile `?proje=…&blok=…` tohumuyla buraya yönlendirir. Taban
   * tohumla BİRLİKTE kaymazsa form kullanıcı hiçbir şey yapmadan `isDirty=true`
   * doğardı (kusur no 1).
   */
  it("`?proje=&blok=` ile açılış, sorgular çözülünce KİRLİ olmaz", () => {
    searchParams = new URLSearchParams("proje=prj-1&blok=blk-a");
    render(<BulkUnitCreateView />);
    // Sorgular (projeler/şantiyeler/bloklar) `beforeEach`te senkron mock'la
    // ZATEN çözülü — kayıt dizisinde tek bir `true` bile olmamalı.
    expect(screen.getByTestId("toplu-form-proje")).toHaveValue("prj-1");
    expect(screen.getByTestId("toplu-form-blok")).toHaveValue("blk-a");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("aynı açılış + kullanıcı bir alanı değiştirir → kirli; geri alır → temiz", () => {
    searchParams = new URLSearchParams("proje=prj-1&blok=blk-a");
    render(<BulkUnitCreateView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "3" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.change(screen.getByTestId("toplu-form-kat-basina"), { target: { value: "" } });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
