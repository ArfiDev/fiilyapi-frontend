import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { SectionDistributionView } from "./SectionDistributionView";
import {
  useSectionDistribution,
  useSaveSectionDistribution,
  type SectionDistributionResponse,
} from "@/lib/api/hooks/useSectionDistribution";
import { MASKED_QUANTITY_REASON } from "@/components/boq-assignment/BoqAssignmentCard";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import {
  SECTION_DISTRIBUTION_FIXTURE,
  maskedSectionDistribution,
} from "./section-distribution.fixture";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useSectionDistribution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSectionDistribution")>()),
  useSectionDistribution: vi.fn(),
  useSaveSectionDistribution: vi.fn(),
}));

let permissionLevel: string | undefined = "full";

// IZN-F6a · kapılar artık yalnız sayfa izinlerinden okunur: `permissionLevel` aynı niyeti oturum `pages`ine de taşır
// (full = tam erişim, diğerleri = her sayfada yalnız Görür).
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  return {
    ...actual,
    useSession: () => ({
      ...actual.SESSION_CONTEXT_DEFAULT,
      me: permissionLevel === "full" ? meFixture() : meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    }),
  };
});

let disciplineScope = { isRestricted: false, names: [] as string[] };
vi.mock("@/lib/auth/useDisciplineScope", () => ({
  useDisciplineScope: () => disciplineScope,
}));

const BOQ_HREF = "/projeler/p-1/santiyeler/s-1/is-kalemleri";
const mutateAsync = vi.fn();

function mockHooks(data: SectionDistributionResponse | undefined = SECTION_DISTRIBUTION_FIXTURE) {
  vi.mocked(useSectionDistribution).mockReturnValue({
    data,
    isError: false,
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSaveSectionDistribution).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never);
}

function renderView() {
  return render(<SectionDistributionView siteId="site-a-blok" boqHref={BOQ_HREF} />);
}

function cell(code: string, sectionName: string): HTMLInputElement {
  return screen.getByLabelText(`${code} · ${sectionName} payı`) as HTMLInputElement;
}

function typeInCell(code: string, sectionName: string, value: string) {
  fireEvent.change(cell(code, sectionName), { target: { value } });
}

async function save() {
  fireEvent.click(screen.getByTestId("bdg-save"));
  await waitFor(() => expect(true).toBe(true));
}

function distributeButton(sectionName: string): HTMLElement {
  const index = SECTION_DISTRIBUTION_FIXTURE.sections.findIndex((s) => s.name === sectionName);
  return screen.getAllByTestId("bdg-distribute-remaining")[index];
}

function badgeOf(code: string): HTMLElement {
  const codes = ["03.001", "03.002", "04.001", "04.002"];
  return screen.getAllByTestId("bdg-remaining")[codes.indexOf(code)];
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionLevel = "full";
  disciplineScope = { isRestricted: false, names: [] };
  mutateAsync.mockResolvedValue(SECTION_DISTRIBUTION_FIXTURE);
  mockHooks();
});

describe("Bölüm dağılımı — başlık, bant, kırıntı", () => {
  it("başlık kartı: Şantiye etiketi, h1 şantiye adı, proje adı, sayaçlar", () => {
    renderView();

    expect(screen.getByText("Şantiye")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A-Blok");
    expect(screen.getByTestId("bdg-head-project")).toHaveTextContent("Güneşkent Konut");
    expect(screen.getByTestId("bdg-section-count")).toHaveTextContent("3");
    expect(screen.getByTestId("bdg-distributed-count")).toHaveTextContent("1/4");
    expect(screen.getByText("Bölümler")).toBeInTheDocument();
    expect(screen.getByText("Bölüme Dağıtılmış Kalem")).toBeInTheDocument();
  });

  it("açıklama bandı metni AYNEN", () => {
    renderView();

    expect(screen.getByText("Bölüm Dağılımı — Ne işe yarar?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Şantiyedeki her iş kalemi birden fazla bölüme bölünebilir. Örneğin 1.200 m³ betonun 400'ü Kat 6-10'a, 300'ü Kat 11-15'e verilir; kalan atanmamış havuzda bekler. Günlük kayıtta bölüm seçimi bu dağılımı kullanır.",
      ),
    ).toBeInTheDocument();
  });

  it("kırıntı İş Kalemleri'ne döner", () => {
    renderView();

    expect(screen.getByRole("link", { name: "← İş Kalemleri" })).toHaveAttribute("href", BOQ_HREF);
  });
});

describe("Bölüm dağılımı — K3 atanmamış uyarısı", () => {
  it("atanmamış kalem varken kalem listesiyle görünür", () => {
    renderView();

    expect(screen.getByTestId("bdg-unallocated-warning")).toHaveTextContent(
      "3 kalemde atanmamış miktar var: 03.001 (500 m³), 04.001 (1.200 m²), 04.002 (600 m²)",
    );
  });

  it("unallocated_item_count 0 iken GİZLİ", () => {
    mockHooks({ ...SECTION_DISTRIBUTION_FIXTURE, unallocated_item_count: 0 });
    renderView();

    expect(screen.queryByTestId("bdg-unallocated-warning")).toBeNull();
  });

  it("maskeli rolde yalnız kodlar", () => {
    mockHooks(maskedSectionDistribution());
    renderView();

    expect(screen.getByTestId("bdg-unallocated-warning")).toHaveTextContent(
      "3 kalemde atanmamış miktar var: 03.001, 04.001, 04.002",
    );
  });
});

describe("Bölüm dağılımı — tablo", () => {
  it("bölüm kolonları sections sırasında; taslak bölüm normal başlık, rozet yok", () => {
    renderView();

    const headers = screen.getAllByTestId("bdg-section-column");
    expect(headers.map((th) => th.textContent)).toEqual([
      expect.stringContaining("Kat 1-5"),
      expect.stringContaining("Kat 6-10"),
      expect.stringContaining("Kat 11-15"),
    ]);
    expect(headers[2].textContent).not.toMatch(/taslak/i);
    expect(headers[2].textContent).not.toContain("🏗");
  });

  it("grup satırları ve sabit kolon başlıkları basılır", () => {
    renderView();

    expect(screen.getByText("A — BETONARME")).toBeInTheDocument();
    expect(screen.getByText("B — İNCE İŞLER")).toBeInTheDocument();
    for (const title of ["Poz No", "Poz Adı", "Birim", "Birim F.", "Şantiye Kotası", "Atanmamış"]) {
      expect(screen.getByRole("columnheader", { name: title })).toBeInTheDocument();
    }
  });

  it("hücreler sunucu paylarıyla açılır (sondaki sıfırlar kırpılır)", () => {
    renderView();

    expect(cell("03.001", "Kat 1-5").value).toBe("400");
    expect(cell("03.001", "Kat 11-15").value).toBe("");
    expect(cell("03.002", "Kat 11-15").value).toBe("32");
  });

  it("atanmamış rozeti: tam dağıtılmış kapalı, kısmi kırmızı kalan", () => {
    renderView();

    expect(badgeOf("03.002")).toHaveAttribute("data-settled", "true");
    expect(badgeOf("03.001")).toHaveAttribute("data-settled", "false");
    expect(badgeOf("03.001")).toHaveTextContent("500");
    expect(badgeOf("04.001")).toHaveTextContent("1.200");
  });

  it("canlı rozet taslaktan hesaplanır ve 'kaydedilmedi' taşır", () => {
    renderView();

    typeInCell("03.001", "Kat 11-15", "500");

    expect(badgeOf("03.001")).toHaveAttribute("data-settled", "true");
    expect(screen.getByTestId("bdg-remaining-unsaved")).toHaveTextContent("kaydedilmedi");
  });

  it("K3 uyarısı taslakla DEĞİŞMEZ (kayıtlı durumdan)", () => {
    renderView();

    typeInCell("03.001", "Kat 11-15", "500");

    expect(screen.getByTestId("bdg-unallocated-warning")).toHaveTextContent("03.001 (500 m³)");
  });
});

describe("Bölüm dağılımı — kaydetme (BİRLEŞTİRME)", () => {
  it("yalnız kirli hücre gövdeye girer", async () => {
    renderView();

    typeInCell("03.001", "Kat 1-5", "450");
    await save();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [{ boq_item_id: "bi-1", section_id: "sec-1", quantity: "450" }],
    });
  });

  it("boşaltılan hücre quantity: null ANAHTARIYLA gider", async () => {
    renderView();

    typeInCell("03.001", "Kat 1-5", "");
    await save();

    const [body] = mutateAsync.mock.calls[0];
    expect(body).toStrictEqual({
      allocations: [{ boq_item_id: "bi-1", section_id: "sec-1", quantity: null }],
    });
    expect("quantity" in body.allocations[0]).toBe(true);
  });

  it("0 girişi görünür ret üretir, istek ATILMAZ", async () => {
    renderView();

    typeInCell("03.001", "Kat 1-5", "0");
    await save();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("cdist-status")).toHaveTextContent(
      "03.001 · Kat 1-5: Miktar 0 olamaz — dağılımı kaldırmak için hücreyi boş bırakın.",
    );
  });

  it("422 detail AYNEN basılır, kirli hücre korunur", async () => {
    mutateAsync.mockRejectedValue(
      new BackendError(422, { detail: "03.001 kalemi için dağıtılan miktar şantiye miktarını aşıyor." }),
    );
    renderView();

    typeInCell("03.001", "Kat 1-5", "999999");
    await save();

    await waitFor(() =>
      expect(
        screen.getByText("03.001 kalemi için dağıtılan miktar şantiye miktarını aşıyor."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("bdg-save")).toBeEnabled();
  });

  it("başarıda kirli harita temizlenir ve 'Bölüm dağılımı kaydedildi.' yazar", async () => {
    renderView();

    typeInCell("03.001", "Kat 1-5", "450");
    await save();

    await waitFor(() =>
      expect(screen.getByText("Bölüm dağılımı kaydedildi.")).toBeInTheDocument(),
    );
    expect(cell("03.001", "Kat 1-5")).toHaveAttribute("data-dirty", "false");
    expect(screen.getByTestId("bdg-save")).toBeDisabled();
  });

  it("kirli hücre unsavedRegistry'yi işaretler, kayıttan sonra düşer", async () => {
    renderView();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    typeInCell("03.001", "Kat 1-5", "450");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await save();
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });
});

describe("Bölüm dağılımı — Kalanı buraya dağıt", () => {
  it("bölüm kolonunu atanmamışla doldurur, tam kaleme dokunmaz", () => {
    renderView();

    fireEvent.click(distributeButton("Kat 11-15"));

    expect(cell("03.001", "Kat 11-15").value).toBe("500");
    expect(cell("04.001", "Kat 11-15").value).toBe("1200");
    expect(cell("04.002", "Kat 11-15").value).toBe("600");
    expect(cell("03.002", "Kat 11-15")).toHaveAttribute("data-dirty", "false");
    expect(cell("03.002", "Kat 11-15").value).toBe("32");
  });

  it("Kaydet gövdesi yalnız doldurulan hücreleri içerir", async () => {
    renderView();

    fireEvent.click(distributeButton("Kat 11-15"));
    await save();

    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [
        { boq_item_id: "bi-1", section_id: "sec-3", quantity: "500" },
        { boq_item_id: "bi-3", section_id: "sec-3", quantity: "1200" },
        { boq_item_id: "bi-4", section_id: "sec-3", quantity: "600" },
      ],
    });
  });

  it("kalan yoksa 'Dağıtılacak kalan yok.' bildirimi; atlanan sayısı yazılır", () => {
    renderView();

    fireEvent.click(distributeButton("Kat 11-15"));
    fireEvent.click(distributeButton("Kat 11-15"));
    expect(screen.getByText("Dağıtılacak kalan yok.")).toBeInTheDocument();

    typeInCell("03.001", "Kat 1-5", "2000"); // 2000 + 300 + 500 > 1200 → aşım
    fireEvent.click(distributeButton("Kat 6-10"));
    expect(screen.getByTestId("cdist-status")).toHaveTextContent("1 kalem atlandı");
  });
});

describe("Bölüm dağılımı — yazma kapıları", () => {
  it("boq izni full değilse girdiler, Kaydet ve Kalanı dağıt DEVRE DIŞI + gerekçe", () => {
    permissionLevel = "view";
    renderView();

    expect(cell("03.001", "Kat 1-5")).toBeDisabled();
    expect(screen.getByTestId("bdg-save")).toBeDisabled();
    for (const button of screen.getAllByTestId("bdg-distribute-remaining")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByTestId("bdg-write-reason")).toHaveTextContent(
      "Bölüm Dağılımı sayfasında Düzenler yetkisi gerekir — dağılım salt okunur.",
    );
  });

  it("metraj gizli rolde (full izin) girdiler devre dışı, gerekçe MASKED_QUANTITY_REASON, rozet '—'", () => {
    mockHooks(maskedSectionDistribution());
    renderView();

    expect(cell("03.001", "Kat 1-5")).toBeDisabled();
    expect(screen.getByTestId("bdg-save")).toBeDisabled();
    for (const button of screen.getAllByTestId("bdg-distribute-remaining")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByTestId("bdg-write-reason")).toHaveTextContent(MASKED_QUANTITY_REASON);
    for (const badge of screen.getAllByTestId("bdg-remaining")) {
      expect(badge).toHaveTextContent("—");
    }
  });

  it("full izin ve maskesiz veride gerekçe satırı YOK", () => {
    renderView();

    expect(screen.queryByTestId("bdg-write-reason")).toBeNull();
    expect(cell("03.001", "Kat 1-5")).toBeEnabled();
  });
});

describe("Bölüm dağılımı — DSC, erişim, durumlar", () => {
  it("kısıtlı kullanıcı ve kalem yok → boş bildirim", () => {
    disciplineScope = { isRestricted: true, names: ["Mekanik"] };
    mockHooks({
      ...SECTION_DISTRIBUTION_FIXTURE,
      groups: [],
      total_item_count: 0,
      distributed_item_count: 0,
      unallocated_item_count: 0,
      unallocated_item_codes: [],
    });
    renderView();

    expect(screen.getByTestId("restricted-empty-notice")).toHaveTextContent(
      "Disiplininize ait kayıt yok.",
    );
  });

  it("kısıtsız kullanıcı ve kalem yok → düz boş metin", () => {
    mockHooks({ ...SECTION_DISTRIBUTION_FIXTURE, groups: [] });
    renderView();

    expect(screen.queryByTestId("restricted-empty-notice")).toBeNull();
    expect(screen.getByText("Bu şantiyede henüz iş kalemi tanımlanmadı.")).toBeInTheDocument();
  });

  it("403 → AccessDenied", () => {
    vi.mocked(useSectionDistribution).mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      error: new BackendError(403, { detail: "yok" }),
    } as never);
    renderView();

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByTestId("bdg-save")).toBeNull();
  });

  it("okunamazsa gerekçe, yükleniyorken Yükleniyor…", () => {
    vi.mocked(useSectionDistribution).mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      error: new Error("boom"),
    } as never);
    const { unmount } = renderView();
    expect(screen.getByText("Bölüm dağılımı yüklenemedi")).toBeInTheDocument();
    unmount();

    vi.mocked(useSectionDistribution).mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: true,
      error: null,
    } as never);
    renderView();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });
});

describe("Bölüm dağılımı — bölüm özeti kartları", () => {
  it("her bölüm için kart: kalemler (miktar + birim) ve toplam", () => {
    renderView();

    const cards = screen.getAllByTestId("bdg-summary-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByRole("heading", { level: 2 })).toHaveTextContent("Kat 1-5");
    const quantities = within(cards[0]).getAllByTestId("bdg-summary-qty");
    expect(quantities[0]).toHaveTextContent("400 m³");
    expect(within(cards[0]).getByTestId("bdg-summary-total")).toHaveTextContent("₺ 1,8M");
  });

  it("maskeli rolde kart değerleri '—'", () => {
    mockHooks(maskedSectionDistribution());
    renderView();

    const card = screen.getAllByTestId("bdg-summary-card")[0];
    for (const qty of within(card).getAllByTestId("bdg-summary-qty")) {
      expect(qty).toHaveTextContent("—");
    }
    expect(within(card).getByTestId("bdg-summary-total")).toHaveTextContent("—");
  });

  it("payı olmayan bölüm kartı boş gerekçesini yazar", () => {
    const data = SECTION_DISTRIBUTION_FIXTURE;
    mockHooks({
      ...data,
      section_summaries: data.section_summaries.map((summary, index) =>
        index === 2 ? { ...summary, items: [] } : summary,
      ),
    });
    renderView();

    expect(
      within(screen.getAllByTestId("bdg-summary-card")[2]).getByText(
        "Bu bölüme henüz miktar atanmadı.",
      ),
    ).toBeInTheDocument();
  });
});
