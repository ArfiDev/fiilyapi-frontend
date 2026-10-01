import { Profiler } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { ContractDistributionView } from "./ContractDistributionView";
import {
  useContractDistribution,
  useEmployerContract,
  type ContractDistributionResponse,
  type EmployerContractDetail,
} from "@/lib/api/hooks/useContract";
import { useSaveContractDistribution } from "@/lib/api/hooks/useContractMutations";
import { useProject } from "@/lib/api/hooks/useProjects";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useContractDistribution: vi.fn(),
  useEmployerContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContractMutations", () => ({
  useSaveContractDistribution: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));

let permissionLevel: string | undefined = "full";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({
    level: permissionLevel,
    canView: true,
    canWrite: permissionLevel !== "read",
    canDelete: permissionLevel === "full",
  }),
}));

/**
 * POZ fikstürü: İKİ şantiye + iki grup. Üçüncü kalem HİÇ dağıtılmamıştır
 * (mockup 153-161) ve `remaining_quantity` doludur.
 */
const DISTRIBUTION: ContractDistributionResponse = {
  sites: [
    { id: "s-1", name: "A-Blok" },
    { id: "s-2", name: "B-Blok" },
  ],
  groups: [
    {
      id: "cg-1",
      name: "A — Betonarme İşleri",
      sort_order: 10,
      items: [
        {
          id: "ci-1",
          code: "03.001",
          description: "Kat Döşemesi Betonu C25/30",
          unit: "m³",
          quantity: "3200.000",
          unit_price: "1850.00",
          remaining_quantity: "0.000",
          allocations: [
            { site_id: "s-1", quantity: "1900.000", boq_item_id: "ci-1" },
            { site_id: "s-2", quantity: "1300.000", boq_item_id: "ci-1" },
          ],
        },
        {
          id: "ci-3",
          code: "03.003",
          description: "Nervürlü Demir Ø12–Ø20",
          unit: "Ton",
          quantity: "200.000",
          unit_price: "21500.00",
          remaining_quantity: "0.000",
          allocations: [
            { site_id: "s-1", quantity: "120.000", boq_item_id: "ci-3" },
            { site_id: "s-2", quantity: "80.000", boq_item_id: "ci-3" },
          ],
        },
      ],
    },
    {
      id: "cg-3",
      name: "C — Duvar & Kaplama",
      sort_order: 30,
      items: [
        {
          id: "ci-5",
          code: "05.001",
          description: "İnce Sıva (Alçı)",
          unit: "m²",
          quantity: "18400.000",
          unit_price: "145.00",
          remaining_quantity: "18400.000",
          allocations: [],
        },
      ],
    },
  ],
  undistributed_item_count: 1,
  undistributed_item_names: ["İnce Sıva (Alçı)"],
  site_summaries: [
    {
      site_id: "s-1",
      site_name: "A-Blok",
      items: [
        {
          code: "03.001",
          description: "Kat Döşemesi Betonu",
          quantity: "1900.000",
          unit_price: "1850.00",
          amount: "3515000.00",
        },
        // Kodu ızgarada OLMAYAN kalem — birim ÇÖZÜLEMEZ dalı.
        {
          code: "99.999",
          description: "Arşiv Kalemi",
          quantity: "5.000",
          unit_price: "100.00",
          amount: "500.00",
        },
      ],
      total_amount: "11200000.00",
    },
    {
      site_id: "s-2",
      site_name: "B-Blok",
      items: [],
      total_amount: "9400000.00",
    },
  ],
  distributed_item_count: 2,
  total_item_count: 3,
};

const DETAIL = {
  project_id: "p-1",
  contract_no: "SZL-2025-001",
  amount: "22400000.00",
  employer_name: "Güneşkent Gayrimenkul A.Ş.",
} as unknown as EmployerContractDetail;

const mutateAsync = vi.fn();

function mockHooks(distribution: ContractDistributionResponse | undefined = DISTRIBUTION) {
  vi.mocked(useContractDistribution).mockReturnValue({
    data: distribution,
    isError: false,
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useEmployerContract).mockReturnValue({
    data: DETAIL,
    isError: false,
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useProject).mockReturnValue({
    data: { id: "p-1", name: "Güneşkent Konut Kompleksi" },
    isError: false,
    isLoading: false,
  } as never);
  vi.mocked(useSaveContractDistribution).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never);
}

/** `03.001 · A-Blok kotası` gibi erişilebilir adla hücreyi bulur. */
function cell(code: string, siteName: string): HTMLInputElement {
  return screen.getByLabelText(`${code} · ${siteName} kotası`) as HTMLInputElement;
}

function typeInCell(code: string, siteName: string, value: string) {
  fireEvent.change(cell(code, siteName), { target: { value } });
}

async function save() {
  fireEvent.click(screen.getByTestId("cdist-save"));
  await waitFor(() => expect(true).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionLevel = "full";
  mutateAsync.mockResolvedValue(DISTRIBUTION);
  mockHooks();
});

describe("POZ dağılımı — BİRLEŞTİRME (merge) semantiği", () => {
  it("dokunulmamış hücre gövdeye GİRMEZ — yalnız kirli hücreler gider", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "2000");
    await save();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [{ contract_item_id: "ci-1", site_id: "s-1", quantity: "2000" }],
    });
    // ci-1/s-2, ci-3/s-1, ci-3/s-2 hiç gönderilmedi → sunucuda KORUNUR.
    const [body] = mutateAsync.mock.calls[0] as [{ allocations: unknown[] }];
    expect(body.allocations).toHaveLength(1);
  });

  it("boşaltılan hücre `quantity: null` gider (bağ koparma, satır silinmez)", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.003", "B-Blok", "");
    await save();

    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [{ contract_item_id: "ci-3", site_id: "s-2", quantity: null }],
    });
  });

  it("`0` yazılırsa kaydetme HİÇ BAŞLAMAZ ve gerekçe görünür olur", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "0");
    await save();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(/03\.001 · A-Blok: Miktar 0 olamaz/),
    ).toBeInTheDocument();
  });

  it("geçersiz metin de isteği engeller (negatif/sayı olmayan)", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "B-Blok", "-5");
    await save();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/geçerli bir sayı olmalı/)).toBeInTheDocument();
  });

  it("birden çok kirli hücre birlikte gider, temizler ayrı ayrı null olur", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "1,5");
    typeInCell("03.003", "A-Blok", "");
    await save();

    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [
        // Virgül noktaya çevrilir; sayıya çevirip geri basılmaz.
        { contract_item_id: "ci-1", site_id: "s-1", quantity: "1.5" },
        { contract_item_id: "ci-3", site_id: "s-1", quantity: null },
      ],
    });
  });

  it("başarılı kayıttan sonra kirli sayaç sıfırlanır ve buton yeniden devre dışı kalır", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getByTestId("cdist-save")).toBeDisabled();
    typeInCell("03.001", "A-Blok", "2000");
    expect(screen.getByTestId("cdist-save")).toBeEnabled();
    expect(screen.getByText(/Kaydedilmemiş 1 hücre değişikliği/)).toBeInTheDocument();

    await save();

    await waitFor(() =>
      expect(screen.getByText("Poz dağılımı kaydedildi.")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("cdist-save")).toBeDisabled();
  });

  // SEKME-F1.3 · üst çubuk sekme onayı `unsavedRegistry`den okur — kirli
  // hücre sayacıyla (yukarıdaki test) AYNI `edits` kaynağına bağlı olduğu
  // için burada kirli sayaçla BİREBİR aynı geçişleri izler.
  it("hücre düzenlemesi unsavedRegistry'yi 'kirli' işaretler, kayıttan sonra düşer", async () => {
    const { unmount } = render(<ContractDistributionView projectId="p-1" />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    typeInCell("03.001", "A-Blok", "2000");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await save();
    await waitFor(() =>
      expect(screen.getByText("Poz dağılımı kaydedildi.")).toBeInTheDocument(),
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
  });
});

describe("POZ dağılımı — ızgara", () => {
  it("şantiye kolonları DİNAMİKTİR (veri kaç şantiye verirse o kadar)", () => {
    render(<ContractDistributionView projectId="p-1" />);

    const columns = screen.getAllByTestId("cdist-site-column");
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveTextContent("A-Blok Kota");
    expect(columns[1]).toHaveTextContent("B-Blok Kota");
  });

  it("tek şantiyeli projede tek kota kolonu basılır", () => {
    mockHooks({
      ...DISTRIBUTION,
      sites: [{ id: "s-1", name: "A-Blok" }],
    });
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getAllByTestId("cdist-site-column")).toHaveLength(1);
  });

  it("Kalan rozeti 0'da ✓ 0, aksi hâlde kalan miktardır (yumuşak Σ gösterimi)", () => {
    render(<ContractDistributionView projectId="p-1" />);

    // `✓` inline SVG'dir (F-SEM) ⇒ metinden okunamaz. İddia ZAYIFLAMAZ:
    // kapanmışlık artık `data-settled` damgasından YAPISAL olarak okunur —
    // "0" metnini basan ama kapanmamış bir rozet bu testi geçemez.
    const badges = screen.getAllByTestId("cdist-remaining");
    expect(badges[0]).toHaveAttribute("data-settled", "true");
    expect(badges[0]).toHaveTextContent("0");
    expect(badges[0].querySelector("svg")).not.toBeNull();
    expect(badges[0].className).toContain("ecd-items__remaining--zero");
    expect(badges[2]).toHaveAttribute("data-settled", "false");
    expect(badges[2]).toHaveTextContent("18.400");
    expect(badges[2].querySelector("svg")).toBeNull();
    expect(badges[2].className).toContain("cdist-grid__remaining--open");
  });

  it("dağıtılmamış kalem satırı işaretlenir (POZ 153-155)", () => {
    render(<ContractDistributionView projectId="p-1" />);

    const row = screen.getByTestId("cdist-undistributed-row");
    // `⚠` inline SVG'dir (F-SEM); metin + ikon AYRI AYRI doğrulanır.
    const note = within(row).getByTestId("cdist-undistributed-note");
    expect(note).toHaveTextContent("Henüz şantiyeye atanmadı");
    expect(note.querySelector("svg")).not.toBeNull();
    expect(cell("05.001", "A-Blok").value).toBe("");
  });

  it("hücre başlangıç değeri sondaki sıfırlardan arındırılmış kotadır", () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(cell("03.001", "A-Blok").value).toBe("1900");
    expect(cell("03.003", "B-Blok").value).toBe("80");
  });
});

describe("POZ dağılımı — bantlar, başlık, özet kartları", () => {
  it("dağıtılmamış uyarı bandı yanıttaki alandan basılır", () => {
    render(<ContractDistributionView projectId="p-1" />);

    const band = screen.getByTestId("cdist-undistributed-warning");
    expect(band).toHaveTextContent("1 poz henüz dağıtılmadı:");
    expect(band).toHaveTextContent("İnce Sıva (Alçı)");
  });

  it("dağıtılmamış kalem yoksa uyarı bandı HİÇ basılmaz", () => {
    mockHooks({
      ...DISTRIBUTION,
      undistributed_item_count: 0,
      undistributed_item_names: [],
    });
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.queryByTestId("cdist-undistributed-warning")).toBeNull();
  });

  it("başlık sözleşme DETAY çağrısından gelir, sayaçlar dağılım yanıtından", () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getByTestId("cdist-head-no")).toHaveTextContent("SZL-2025-001");
    expect(screen.getByTestId("cdist-head-parties")).toHaveTextContent(
      "İşveren: Güneşkent Gayrimenkul A.Ş.",
    );
    expect(screen.getByTestId("cdist-site-count")).toHaveTextContent("2");
    expect(screen.getByTestId("cdist-distributed-count")).toHaveTextContent("2/3");
  });

  it("şantiye özet kartında birim POZ KODUNDAN join'lenir; çözülemeyende birim basılmaz", () => {
    render(<ContractDistributionView projectId="p-1" />);

    const cards = screen.getAllByTestId("cdist-summary-card");
    const quantities = within(cards[0]).getAllByTestId("cdist-summary-qty");
    // 03.001 ızgarada var → "m³" eklenir.
    expect(quantities[0]).toHaveTextContent("1.900 m³");
    // 99.999 ızgarada YOK → birim uydurulmaz.
    expect(quantities[1]).toHaveTextContent("5");
    expect(quantities[1].textContent).not.toMatch(/[a-zA-Z³²]/);
  });

  it("özet kartı sayısı da dinamiktir ve boş kart gerekçesini yazar", () => {
    render(<ContractDistributionView projectId="p-1" />);

    const cards = screen.getAllByTestId("cdist-summary-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[1]).getByText("Bu şantiyeye henüz kota atanmadı.")).toBeInTheDocument();
  });
});

describe("POZ dağılımı — hata ve izin yolları", () => {
  it("422 aşım hatası backend mesajıyla Türkçe basılır", async () => {
    mutateAsync.mockRejectedValue(
      new BackendError(422, { detail: "Dağıtılan miktar sözleşme miktarını aşıyor." }),
    );
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "999999");
    await save();

    await waitFor(() =>
      expect(
        screen.getByText("Dağıtılan miktar sözleşme miktarını aşıyor."),
      ).toBeInTheDocument(),
    );
    // Kirli hücre KORUNUR: kullanıcı düzeltip yeniden deneyebilsin.
    expect(screen.getByTestId("cdist-save")).toBeEnabled();
  });

  it("gövdesiz hatada düşüş mesajı basılır", async () => {
    mutateAsync.mockRejectedValue(new Error("network"));
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "10");
    await save();

    await waitFor(() =>
      expect(screen.getByText("Poz dağılımı kaydedilemedi.")).toBeInTheDocument(),
    );
  });

  it("yazma izni yoksa hücreler ve buton devre dışıdır, gerekçe görünür", () => {
    permissionLevel = "read";
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getByTestId("cdist-save")).toBeDisabled();
    expect(cell("03.001", "A-Blok")).toBeDisabled();
    expect(screen.getByTestId("cdist-readonly-notice")).toBeInTheDocument();
  });

  it("dağılım okunamazsa ızgara yerine gerekçe basılır", () => {
    vi.mocked(useContractDistribution).mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      error: new Error("boom"),
    } as never);
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getByText("Poz dağılımı yüklenemedi")).toBeInTheDocument();
  });

  it("izin 403 ise erişim reddi ekranı çıkar", () => {
    vi.mocked(useContractDistribution).mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      error: new BackendError(403, { detail: "yok" }),
    } as never);
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.queryByTestId("cdist-save")).toBeNull();
  });
});

// KDG K7 (CEO 2026-10-01) · "Kalanı buraya dağıt" + canlı Kalan rozeti.
describe("POZ dağılımı — Kalanı buraya dağıt (KDG K7)", () => {
  function distributeButton(siteName: string): HTMLElement {
    const index = DISTRIBUTION.sites.findIndex((site) => site.name === siteName);
    return screen.getAllByTestId("cdist-distribute-remaining")[index];
  }

  function badgeOf(code: string): HTMLElement {
    const codes = ["03.001", "03.003", "05.001"];
    return screen.getAllByTestId("cdist-remaining")[codes.indexOf(code)];
  }

  it("her şantiye kolon başlığında bir düğme basılır", () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.getAllByTestId("cdist-distribute-remaining")).toHaveLength(2);
    expect(distributeButton("A-Blok")).toBeEnabled();
    expect(distributeButton("A-Blok")).toHaveTextContent("Kalanı buraya dağıt");
  });

  it("düğme kalanı hücreye yazar ve hücreyi kirli yapar", () => {
    render(<ContractDistributionView projectId="p-1" />);

    fireEvent.click(distributeButton("A-Blok"));

    expect(cell("05.001", "A-Blok").value).toBe("18400");
    expect(cell("05.001", "A-Blok")).toHaveAttribute("data-dirty", "true");
    // Kalan 0 olan kaleme dokunulmadı.
    expect(cell("03.001", "A-Blok")).toHaveAttribute("data-dirty", "false");
    expect(cell("03.001", "A-Blok").value).toBe("1900");
    expect(screen.getByText(/Kaydedilmemiş 1 hücre değişikliği/)).toBeInTheDocument();
  });

  it("dolu hücrenin üstüne ekler", () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "1800");
    fireEvent.click(distributeButton("B-Blok"));

    // ci-1: 3200 − (1800 + 1300) = 100 → B: 1300 + 100
    expect(cell("03.001", "B-Blok").value).toBe("1400");
  });

  it("Kaydet gövdesi yalnız değişen hücreleri içerir", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    fireEvent.click(distributeButton("A-Blok"));
    await save();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      allocations: [{ contract_item_id: "ci-5", site_id: "s-1", quantity: "18400" }],
    });
  });

  it("canlı rozet taslaktan hesaplanır ve 'kaydedilmedi' işaretini taşır", () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(badgeOf("03.001")).toHaveAttribute("data-settled", "true");
    expect(screen.queryByTestId("cdist-remaining-unsaved")).toBeNull();

    typeInCell("03.001", "A-Blok", "1800");

    expect(badgeOf("03.001")).toHaveAttribute("data-settled", "false");
    expect(badgeOf("03.001")).toHaveTextContent("100");
    expect(screen.getByTestId("cdist-remaining-unsaved")).toHaveTextContent("kaydedilmedi");
  });

  it("Kaydet'ten sonra rozet yine sunucu değerindedir (işaret kalkar)", async () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "1800");
    await save();

    await waitFor(() => expect(screen.queryByTestId("cdist-remaining-unsaved")).toBeNull());
    expect(badgeOf("03.001")).toHaveTextContent("0");
  });

  it("hiçbir kalem değişmezse 'Dağıtılacak kalan yok' bildirimi görünür", () => {
    render(<ContractDistributionView projectId="p-1" />);

    fireEvent.click(distributeButton("A-Blok"));
    fireEvent.click(distributeButton("A-Blok"));

    expect(screen.getByText("Dağıtılacak kalan yok.")).toBeInTheDocument();
  });

  it("atlanan kalem sayısı yazılır (taslakta aşım)", () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("03.001", "A-Blok", "2000"); // 2000 + 1300 > 3200
    fireEvent.click(distributeButton("B-Blok"));

    expect(screen.getByTestId("cdist-status")).toHaveTextContent("1 kalem atlandı");
    // Atlanan kalem değişmedi, ötekiler doldu.
    expect(cell("03.001", "B-Blok").value).toBe("1300");
    expect(cell("05.001", "B-Blok").value).toBe("18400");
  });

  it("geçersiz taslaklı kalem atlanır ve sayılır", () => {
    render(<ContractDistributionView projectId="p-1" />);

    typeInCell("05.001", "A-Blok", "abc");
    fireEvent.click(distributeButton("B-Blok"));

    expect(screen.getByTestId("cdist-status")).toHaveTextContent("1 kalem atlandı");
    expect(cell("05.001", "B-Blok").value).toBe("");
  });

  it("yazma izni yokken düğme devre dışı ve gerekçe görünür", () => {
    permissionLevel = "read";
    render(<ContractDistributionView projectId="p-1" />);

    for (const button of screen.getAllByTestId("cdist-distribute-remaining")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByTestId("cdist-distribute-reason")).toHaveTextContent(
      "yazma izniniz yok",
    );
  });

  it("metraj gizliyken (maskeli kalem) düğme devre dışı, gerekçe görünür, rozet '—'", () => {
    const masked: ContractDistributionResponse = {
      ...DISTRIBUTION,
      groups: DISTRIBUTION.groups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.id === "ci-5" ? { ...item, quantity: null, remaining_quantity: null } : item,
        ),
      })),
    } as unknown as ContractDistributionResponse;
    mockHooks(masked);
    render(<ContractDistributionView projectId="p-1" />);

    for (const button of screen.getAllByTestId("cdist-distribute-remaining")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByTestId("cdist-distribute-reason")).toHaveTextContent("metraj");
    expect(badgeOf("05.001")).toHaveTextContent("—");
  });

  it("izin ve maske serbestken gerekçe satırı basılmaz", () => {
    render(<ContractDistributionView projectId="p-1" />);

    expect(screen.queryByTestId("cdist-distribute-reason")).toBeNull();
  });

  it("düğme TEK render üretir (tek setEdits)", () => {
    const onRender = vi.fn();
    render(
      <Profiler id="cdist" onRender={onRender}>
        <ContractDistributionView projectId="p-1" />
      </Profiler>,
    );
    const before = onRender.mock.calls.length;

    fireEvent.click(distributeButton("A-Blok"));

    expect(onRender.mock.calls.length - before).toBe(1);
  });

  it("500 kalem × 4 şantiye: düğme tek render ve makul sürede", () => {
    const sites = ["s-1", "s-2", "s-3", "s-4"].map((id, index) => ({
      id,
      name: `Blok-${index + 1}`,
    }));
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `ci-${index}`,
      code: `P.${index}`,
      description: `Kalem ${index}`,
      unit: "m²",
      quantity: "1000.000",
      unit_price: "10.00",
      remaining_quantity: "850.000",
      allocations: [{ site_id: "s-1", quantity: "150.000", boq_item_id: `ci-${index}` }],
    }));
    mockHooks({
      ...DISTRIBUTION,
      sites,
      groups: [{ id: "cg-x", name: "Büyük", sort_order: 1, items }],
      undistributed_item_count: 0,
      undistributed_item_names: [],
      site_summaries: [],
    } as unknown as ContractDistributionResponse);
    const onRender = vi.fn();
    render(
      <Profiler id="cdist-big" onRender={onRender}>
        <ContractDistributionView projectId="p-1" />
      </Profiler>,
    );
    const before = onRender.mock.calls.length;

    fireEvent.click(screen.getAllByTestId("cdist-distribute-remaining")[3]);

    expect(onRender.mock.calls.length - before).toBe(1);
    expect(cell("P.0", "Blok-4").value).toBe("850");
    expect(cell("P.499", "Blok-4").value).toBe("850");
    // jsdom'da 2000 girdi çizimi yavaştır; süre sınırı yalnız takılmayı yakalar.
  }, 60_000);
});
