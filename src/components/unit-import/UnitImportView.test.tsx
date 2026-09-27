import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { UnitImportView } from "./UnitImportView";
import {
  IMPORT_ACCEPT,
  IMPORT_BAD_TYPE_MESSAGE,
  IMPORT_BLOCKS_STALE_NOTICE,
  IMPORT_ERROR_REPORT_PENDING_REASON,
  IMPORT_EXPECTED_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_NOTHING_IMPORTABLE_MESSAGE,
  IMPORT_PROJECT_REQUIRED_MESSAGE,
  IMPORT_SUMMARY_INCONSISTENT_MESSAGE,
  IMPORT_TOO_LARGE_MESSAGE,
  IMPORT_VALIDATION_EMPTY_NOTICE,
} from "./constants";
import type { UnitImportRowReport, UnitImportValidation } from "./report";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import {
  useDownloadUnitsImportTemplate,
  useImportUnits,
  useValidateUnitsImport,
} from "@/lib/api/hooks/useUnitImport";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSites: vi.fn() }));
vi.mock("@/lib/api/hooks/useUnitImport", () => ({
  useValidateUnitsImport: vi.fn(),
  useImportUnits: vi.fn(),
  useDownloadUnitsImportTemplate: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

let searchParams = new URLSearchParams();
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/satis/excel-ice-aktar",
  useSearchParams: () => searchParams,
}));

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function queryStub(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, error: null, ...extra } as never;
}

/**
 * jsdom'da 2 MB'lık bir gövde üretmek anlamsızdır; `size` doğrudan tanımlanır.
 * Ölçülen kural `size > MAX_IMPORT_BYTES` olduğu için TAM 2 MB GEÇMELİDİR.
 */
function xlsxFile(name = "Yesilvadi_Uniteler_v3.xlsx", size = 248 * 1024): File {
  const file = new File(["x"], name, { type: XLSX_MEDIA_TYPE });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function makeRow(overrides: Partial<UnitImportRowReport> = {}): UnitImportRowReport {
  return {
    row: 2,
    status: "ok",
    unit_no: "C-1",
    block_name: "C",
    floor: "1",
    layout: "3+1",
    gross_area_m2: "148",
    list_price: "1280000.00",
    messages: [],
    imported: false,
    ...overrides,
  };
}

/** EI 129-185 — üç örnek satır: geçerli · hatalı (İKİ mesaj) · uyarılı. */
const OK_ROW = makeRow();
const ERROR_ROW = makeRow({
  row: 7,
  status: "error",
  unit_no: "C-6",
  floor: "2",
  layout: null,
  gross_area_m2: "0",
  list_price: "1258600.00",
  // EI 161 — TEK satırda İKİ mesaj.
  messages: ["Oda Tipi boş", "Brüt m² sıfır olamaz"],
});
const WARNING_ROW = makeRow({
  row: 11,
  status: "warning",
  unit_no: "C-10",
  floor: "4",
  list_price: "890000.00",
  messages: ["Fiyat maliyetin altında (₺860.000) — kontrol edin"],
});

function makeValidation(overrides: Partial<UnitImportValidation> = {}): UnitImportValidation {
  return {
    summary: { total_rows: 24, valid: 22, warning: 1, error: 1 },
    rows: [OK_ROW, ERROR_ROW, WARNING_ROW],
    blocks_to_create: ["D Blok"],
    ...overrides,
  };
}

const validateAsync = vi.fn();
const importAsync = vi.fn();
const templateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  validateAsync.mockResolvedValue(makeValidation());
  importAsync.mockResolvedValue({
    summary: { total_rows: 24, valid: 22, warning: 1, error: 1 },
    created: 23,
    skipped: 1,
    blocks_created: 1,
    rows: [],
  });
  templateAsync.mockResolvedValue(undefined);
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { projects: "full" } } as unknown as MeResponse,
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useProjects).mockReturnValue(
    queryStub({ items: [{ id: "prj-1", name: "Yeşilvadi Rezidans" }] }),
  );
  vi.mocked(useSites).mockReturnValue(
    queryStub({ items: [{ id: "site-1", name: "Yeşilvadi Şantiyesi" }] }),
  );
  vi.mocked(useValidateUnitsImport).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: validateAsync,
    isPending: false,
  } as never);
  vi.mocked(useImportUnits).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: importAsync,
    isPending: false,
  } as never);
  vi.mocked(useDownloadUnitsImportTemplate).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: templateAsync,
    isPending: false,
  } as never);
});

function selectProject() {
  fireEvent.change(screen.getByTestId("excel-form-proje"), { target: { value: "prj-1" } });
}

function selectFile(file: File) {
  fireEvent.change(screen.getByTestId("excel-form-dosya"), { target: { files: [file] } });
}

/** Proje + geçerli dosya → doğrulama KENDİLİĞİNDEN koşar. */
async function fillAndValidate(file = xlsxFile()) {
  selectProject();
  selectFile(file);
  await waitFor(() => expect(validateAsync).toHaveBeenCalled());
  await screen.findByTestId("excel-form-sayaclar");
  return file;
}

describe("UnitImportView — TAM SAYFA kabuğu (EI 31-56)", () => {
  it("başlık ve breadcrumb basılır (modal DEĞİL)", () => {
    render(<UnitImportView />);
    expect(
      screen.getByRole("heading", { name: "Excel'den Ünite İçe Aktarma", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kırıntı yolu" })).toHaveTextContent(
      "Excel'den Ünite İçe Aktarma",
    );
  });

  it("üç kart da mockup başlıklarıyla basılır (EI 58 · 93 · 108)", async () => {
    render(<UnitImportView />);
    for (const title of ["Dosya Seçimi", "Doğrulama Sonucu"]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(title), level: 2 }),
        title,
      ).toBeInTheDocument();
    }
    // 108 kartı doğrulama gelmeden ÇİZİLMEZ (boş bir tablo "0 satır" derdi).
    expect(screen.queryByTestId("excel-form-satirlar-kart")).toBeNull();
    await fillAndValidate();
    expect(
      screen.getByRole("heading", { name: /Satır Detayları/, level: 2 }),
    ).toBeInTheDocument();
  });

  it("EI 51 sekmesi AKTİF basılır (şerit ailenin ortak bileşeni)", () => {
    render(<UnitImportView />);
    expect(screen.getByRole("tab", { name: "Excel İçe Aktar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Toplu Üretim" })).toHaveAttribute(
      "href",
      "/satis/toplu-uretim",
    );
  });

  it("İptal bir GEZİNMEDİR (EI 200 `<a href>`) — düğme değil", () => {
    render(<UnitImportView />);
    expect(screen.getByTestId("excel-form-iptal")).toHaveAttribute("href", "/satis");
  });

  it("`projects` yetkisi yoksa AccessDenied basılır (`sales` DEĞİL)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { projects: "none", sales: "full" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<UnitImportView />);
    expect(screen.queryByTestId("excel-form-govde")).not.toBeInTheDocument();
    expect(validateAsync).not.toHaveBeenCalled();
  });

  it("doğrulama kartı ilk açılışta BOŞ değil, gerekçelidir", () => {
    render(<UnitImportView />);
    expect(screen.getByTestId("excel-form-dogrulama-bos")).toHaveTextContent(
      IMPORT_VALIDATION_EMPTY_NOTICE,
    );
  });

  it("`?proje=` bağlamı formu TOHUMLAR ve seçim URL'ye yazılır", () => {
    searchParams = new URLSearchParams("proje=prj-1");
    render(<UnitImportView />);
    expect(screen.getByTestId("excel-form-proje")).toHaveValue("prj-1");
  });
});

describe("UnitImportView — EI 76/79 ONAYLI SAPMA: ekran GERÇEĞİ yazar", () => {
  it("🔴 `accept` YALNIZ `.xlsx`tir (mockup'ın `.xls,.csv`si sunucuda REDDEDİLİR)", () => {
    render(<UnitImportView />);
    const input = screen.getByTestId("excel-form-dosya");
    expect(input).toHaveAttribute("accept", IMPORT_ACCEPT);
    expect(input.getAttribute("accept")).not.toContain(".csv");
    expect(input.getAttribute("accept")).not.toContain(".xls,");
  });

  it("🔴 ipucu 2 MB ve 1000 satır der (mockup'ın '10 MB'ı YANLIŞ)", () => {
    render(<UnitImportView />);
    const card = screen.getByTestId("excel-form-dosya-kart");
    expect(card).toHaveTextContent("Maks 2 MB");
    expect(card).toHaveTextContent("en fazla 1000 satır");
    expect(card).not.toHaveTextContent("10 MB");
  });

  it("🔴 `.csv` İSTEMCİDE reddedilir — sunucunun TAM mesajıyla, istek KURULMADAN", () => {
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile("uniteler.csv"));

    expect(screen.getByText(IMPORT_BAD_TYPE_MESSAGE)).toBeInTheDocument();
    expect(validateAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId("excel-form-dosya-ozet")).toBeNull();
  });

  it("🔴 2 MB'ı AŞAN dosya istemcide reddedilir — istek KURULMAZ", () => {
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile("buyuk.xlsx", IMPORT_MAX_BYTES + 1));

    expect(screen.getByText(IMPORT_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    expect(validateAsync).not.toHaveBeenCalled();
  });

  it("TAM 2 MB GEÇER (sunucu kuralı `size > MAX` — sınır dâhil)", async () => {
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile("tam.xlsx", IMPORT_MAX_BYTES));
    await waitFor(() => expect(validateAsync).toHaveBeenCalled());
  });

  it("ön kontrolün SINIRI görünür yazılır (son söz sunucunun)", () => {
    render(<UnitImportView />);
    expect(screen.getByTestId("excel-form-sunucu-notu")).toHaveTextContent("son söz sunucunun");
  });
});

describe("UnitImportView — EI 82-88 beklenen kolonlar + şablon", () => {
  it("12 kolon `importer.py::COLUMNS` ile AYNI SIRADA basılır", () => {
    render(<UnitImportView />);
    expect(IMPORT_EXPECTED_COLUMNS).toHaveLength(12);
    expect(screen.getByTestId("excel-form-kolonlar")).toHaveTextContent(
      IMPORT_EXPECTED_COLUMNS.join(", "),
    );
  });

  it("EI 87 'Şablon İndir' istemci fonksiyonunu tetikler (proje PATH'tedir)", async () => {
    render(<UnitImportView />);
    selectProject();
    fireEvent.click(screen.getByTestId("excel-form-sablon"));
    await waitFor(() => expect(templateAsync).toHaveBeenCalledWith("prj-1"));
  });

  it("proje seçilmeden şablon düğmesi KAPALIDIR (uç proje kapsamlıdır)", () => {
    render(<UnitImportView />);
    expect(screen.getByTestId("excel-form-sablon")).toBeDisabled();
    expect(screen.getByTestId("excel-form-sablon-ust")).toBeDisabled();
  });

  it("şablon hatası OLDUĞU GİBİ basılır", async () => {
    templateAsync.mockRejectedValue(new BackendError(404, { detail: "Proje bulunamadı." }));
    render(<UnitImportView />);
    selectProject();
    fireEvent.click(screen.getByTestId("excel-form-sablon"));
    expect(await screen.findByTestId("excel-form-sablon-hata")).toHaveTextContent(
      "Proje bulunamadı.",
    );
  });
});

describe("UnitImportView — EI 91-103 doğrulama sonucu", () => {
  it("geçerli `.xlsx` doğrulama ucunu çağırır ve DÖRT sayacı basar", async () => {
    render(<UnitImportView />);
    const file = await fillAndValidate();

    expect(validateAsync.mock.calls[0][0].projectId).toBe("prj-1");
    expect(validateAsync.mock.calls[0][0].input.file).toBe(file);
    expect(screen.getByTestId("excel-form-sayac-toplam")).toHaveTextContent("24");
    expect(screen.getByTestId("excel-form-sayac-gecerli")).toHaveTextContent("22");
    expect(screen.getByTestId("excel-form-sayac-uyari")).toHaveTextContent("1");
    expect(screen.getByTestId("excel-form-sayac-hata")).toHaveTextContent("1");
  });

  it("EI 65-73 dosya özeti boyutu VE okunan satır sayısını basar", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    const summary = screen.getByTestId("excel-form-dosya-ozet");
    expect(summary).toHaveTextContent("Yesilvadi_Uniteler_v3.xlsx");
    expect(summary).toHaveTextContent("248 KB");
    expect(summary).toHaveTextContent("24 satır okundu");
    // EI 69'un `✓`sı GLİF DEĞİL ikondur.
    expect(summary.querySelector("svg")).not.toBeNull();
    expect(summary.textContent ?? "").not.toMatch(/[✓✗⚠]/);
  });

  it("EI 100-102 şeridi aktarılamayacak satır sayısını TÜRETİR", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    // 24 satır − (22 geçerli + 1 uyarılı) = 1
    expect(screen.getByTestId("excel-form-ozet-serit")).toHaveTextContent(
      "1 satır aktarılamayacak.",
    );
  });

  it("🔴 kutucuk kapanınca aktarılamayacak satır sayısı 2 olur (sabit metin YALAN söylerdi)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-uyarili-dahil"));
    expect(screen.getByTestId("excel-form-ozet-serit")).toHaveTextContent(
      "2 satır aktarılamayacak.",
    );
  });

  it("🔴 özet DEĞİŞMEZİ bozulursa sayaçlar SESSİZCE çizilmez", async () => {
    validateAsync.mockResolvedValue(
      makeValidation({ summary: { total_rows: 24, valid: 5, warning: 1, error: 1 } }),
    );
    render(<UnitImportView />);
    await fillAndValidate();

    expect(screen.getByTestId("excel-form-ozet-tutarsiz")).toHaveTextContent(
      IMPORT_SUMMARY_INCONSISTENT_MESSAGE,
    );
    // Tutarsızlık şeridi kırmızı özet şeridinin YERİNE geçer.
    expect(screen.queryByTestId("excel-form-ozet-serit")).toBeNull();
  });

  it("🔴 MOCKUP + BİR: açılacak yeni bloklar GÖRÜNÜR (sessiz blok açma yasak)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(screen.getByTestId("excel-form-yeni-bloklar")).toHaveTextContent("D Blok");
  });

  it("yeni blok yoksa kutu ÇİZİLMEZ", async () => {
    validateAsync.mockResolvedValue(makeValidation({ blocks_to_create: [] }));
    render(<UnitImportView />);
    await fillAndValidate();
    expect(screen.queryByTestId("excel-form-yeni-bloklar")).toBeNull();
  });

  it("doğrulama 403'ü OLDUĞU GİBİ basar (yetki gövdesi yutulmaz)", async () => {
    validateAsync.mockRejectedValue(
      new BackendError(403, { detail: "Bu proje için yazma yetkiniz yok." }),
    );
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile());
    expect(await screen.findByTestId("excel-form-dogrulama-hata")).toHaveTextContent(
      "Bu proje için yazma yetkiniz yok.",
    );
    expect(screen.queryByTestId("excel-form-sayaclar")).toBeNull();
  });

  it("🔴 KUSUR no 384: sunucu hatası geldiğinde 'henüz doğrulanmadı' notu İKİ KATLI basılmaz", async () => {
    validateAsync.mockRejectedValue(
      new BackendError(422, { detail: "Beklenmeyen sütun başlığı." }),
    );
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile());
    expect(await screen.findByTestId("excel-form-dogrulama-hata")).toHaveTextContent(
      "Beklenmeyen sütun başlığı.",
    );
    // Karşılıklı dışlayan koşul: hata GÖRÜNÜRKEN boş/gerekçe notu BASILMAZ.
    expect(screen.queryByTestId("excel-form-dogrulama-bos")).toBeNull();
  });

  it("proje seçilmeden dosya seçmek istek KURMAZ, gerekçe basar", () => {
    render(<UnitImportView />);
    selectFile(xlsxFile());
    expect(validateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("excel-form-dogrulama-hata")).toHaveTextContent(
      IMPORT_PROJECT_REQUIRED_MESSAGE,
    );
  });

  it("KAYIT 385: reddedilmiş dosyadan sonra proje değişince dosya hatası TEMİZLENİR", () => {
    render(<UnitImportView />);
    selectProject();
    selectFile(xlsxFile("uniteler.csv"));
    expect(screen.getByText(IMPORT_BAD_TYPE_MESSAGE)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("excel-form-proje"), { target: { value: "" } });

    expect(screen.queryByText(IMPORT_BAD_TYPE_MESSAGE)).not.toBeInTheDocument();
  });

  it("proje değişince doğrulama ATILIR (başka projenin raporu gösterilmez)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.change(screen.getByTestId("excel-form-proje"), { target: { value: "" } });
    expect(screen.queryByTestId("excel-form-sayaclar")).toBeNull();
    expect(screen.getByTestId("excel-form-dogrulama-bos")).toHaveTextContent(
      "önceki doğrulama sonucu temizlendi",
    );
  });
});

describe("UnitImportView — EI 105-197 satır detayları", () => {
  it("🔴 EI 161: BİR satırdaki İKİ mesaj AYRI elemanlar olarak basılır", async () => {
    render(<UnitImportView />);
    await fillAndValidate();

    const rows = screen.getAllByTestId("excel-form-satir");
    const errorRow = rows.find((row) => row.textContent?.includes("C-6")) as HTMLElement;
    const messages = within(errorRow).getAllByTestId("excel-form-satir-mesaj");

    expect(messages.map((node) => node.textContent)).toEqual([
      "Oda Tipi boş",
      "Brüt m² sıfır olamaz",
    ]);
    // Tek metne birleştirilseydi bu iddia tek eleman görürdü.
    expect(messages).toHaveLength(2);
  });

  it("🔴 durum sütunu SVG basar — `✓ ✗ ⚠` glifleri DEĞİL", async () => {
    render(<UnitImportView />);
    await fillAndValidate();

    const table = screen.getByTestId("excel-form-satir-tablosu");
    expect(table.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
    expect(table.textContent ?? "").not.toMatch(/[✓✗⚠]/);
    // Durum YALNIZ renkten okunmaz: erişilebilir metin de vardır.
    expect(within(table).getByText("Hatalı")).toBeInTheDocument();
    expect(within(table).getByText("Uyarılı")).toBeInTheDocument();
  });

  it("🔴 süzgeç GERÇEKTEN süzer (Hatalı sekmesinde yalnız hatalı satır kalır)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(screen.getAllByTestId("excel-form-satir")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("excel-form-suzgec-error"));
    const errorRows = screen.getAllByTestId("excel-form-satir");
    expect(errorRows).toHaveLength(1);
    expect(errorRows[0]).toHaveTextContent("C-6");

    fireEvent.click(screen.getByTestId("excel-form-suzgec-warning"));
    const warningRows = screen.getAllByTestId("excel-form-satir");
    expect(warningRows).toHaveLength(1);
    expect(warningRows[0]).toHaveTextContent("C-10");

    fireEvent.click(screen.getByTestId("excel-form-suzgec-all"));
    expect(screen.getAllByTestId("excel-form-satir")).toHaveLength(3);
  });

  it("süzgeç rozetlerinin sayıları ÖZETTEN gelir, satır listesinden değil", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    // Listede 3 satır var ama özet 24 diyor: rozet ÖZETİ basar.
    expect(screen.getByTestId("excel-form-suzgec-all")).toHaveTextContent("Tümü (24)");
    expect(screen.getByTestId("excel-form-suzgec-error")).toHaveTextContent("Hatalı (1)");
    expect(screen.getByTestId("excel-form-suzgec-warning")).toHaveTextContent("Uyarılı (1)");
  });

  it("mesajsız satır BOŞ hücre değil 'Hazır' basar (EI 138)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    const okRow = screen
      .getAllByTestId("excel-form-satir")
      .find((row) => row.textContent?.includes("C-1")) as HTMLElement;
    expect(within(okRow).getByText("Hazır")).toBeInTheDocument();
  });

  it("🔴 EI 195 'Hata Raporunu İndir' DEVRE DIŞIdır ve gerekçesi EKRANDA", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(screen.getByTestId("excel-form-hata-raporu")).toBeDisabled();
    // Gerekçe `title`da SAKLANMAZ; metin olarak da bulunur.
    expect(screen.getByText(IMPORT_ERROR_REPORT_PENDING_REASON)).toBeInTheDocument();
  });
});

describe("UnitImportView — EI 192 `include_warnings`", () => {
  it("varsayılan İŞARETLİdir (mockup `checked`, şema varsayılanı `true`)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(screen.getByTestId("excel-form-uyarili-dahil")).toBeChecked();
    expect(validateAsync.mock.calls[0][0].input.includeWarnings).toBe(true);
  });

  it("kutucuğun değeri AKTARIM gövdesine ulaşır", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-uyarili-dahil"));
    fireEvent.click(screen.getByTestId("excel-form-aktar"));
    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    expect(importAsync.mock.calls[0][0].input.includeWarnings).toBe(false);
  });

  it("EI 202 sayısı kutucukla birlikte DEĞİŞİR (22 → 23 aktarılacak satır)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    // 🔴 Mockup 22 yazar ama EI 192 işaretliyken 23 satır yazılır — ekran
    // yazılacak satırı basar, mockup'ın çelişkili sayısını değil.
    expect(screen.getByTestId("excel-form-aktar")).toHaveTextContent("23 Geçerli Satırı Aktar");
    fireEvent.click(screen.getByTestId("excel-form-uyarili-dahil"));
    expect(screen.getByTestId("excel-form-aktar")).toHaveTextContent("22 Geçerli Satırı Aktar");
  });

  it("🔴 kutucuk değişince YALNIZ blok listesi bayat işaretlenir (sayaçlar değil)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-uyarili-dahil"));

    expect(screen.getByTestId("excel-form-yeni-bloklar-bayat")).toHaveTextContent(
      IMPORT_BLOCKS_STALE_NOTICE,
    );
    // Sayaçlar ve satırlar `include_warnings`ten ETKİLENMEZ (`_summary` durum
    // sayar) — tablo ayakta kalır, ikinci bir yükleme zorlanmaz.
    expect(screen.getByTestId("excel-form-sayac-toplam")).toHaveTextContent("24");
    expect(screen.getAllByTestId("excel-form-satir")).toHaveLength(3);
  });
});

describe("UnitImportView — İKİ ADIMLI AKIŞ: dosya İKİ KEZ yüklenir", () => {
  it("🔴 doğrulama ve aktarım AYNI `File` nesnesini gönderir", async () => {
    render(<UnitImportView />);
    const file = await fillAndValidate();

    fireEvent.click(screen.getByTestId("excel-form-aktar"));
    await waitFor(() => expect(importAsync).toHaveBeenCalled());

    // Sunucu dosyayı SAKLAMAZ: aktarım isteği dosyayı yeniden taşımalıdır.
    expect(validateAsync.mock.calls[0][0].input.file).toBe(file);
    expect(importAsync.mock.calls[0][0].input.file).toBe(file);
    expect(importAsync.mock.calls[0][0].input.file).toBe(validateAsync.mock.calls[0][0].input.file);
  });

  it("'Yeniden Doğrula' AYNI dosyayı İKİNCİ kez yükler", async () => {
    render(<UnitImportView />);
    const file = await fillAndValidate();

    fireEvent.click(screen.getByTestId("excel-form-yeniden-dogrula"));
    await waitFor(() => expect(validateAsync).toHaveBeenCalledTimes(2));
    expect(validateAsync.mock.calls[1][0].input.file).toBe(file);
  });

  it("dosya seçilmeden 'Yeniden Doğrula' istek KURMAZ", () => {
    render(<UnitImportView />);
    selectProject();
    fireEvent.click(screen.getByTestId("excel-form-yeniden-dogrula"));
    expect(validateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("excel-form-dogrulama-hata")).toHaveTextContent(
      "Önce bir .xlsx dosyası seçin.",
    );
  });

  it("EI 61 şantiye GERÇEK gövde alanıdır (TU'nun aksine süzgeç DEĞİL)", async () => {
    render(<UnitImportView />);
    selectProject();
    fireEvent.change(screen.getByTestId("excel-form-santiye"), { target: { value: "site-1" } });
    selectFile(xlsxFile());
    await waitFor(() => expect(validateAsync).toHaveBeenCalled());
    expect(validateAsync.mock.calls[0][0].input.siteId).toBe("site-1");
  });

  it("şantiye seçilmezse `siteId` anahtarı HİÇ gitmez (boş dize ≠ yokluk)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(validateAsync.mock.calls[0][0].input).not.toHaveProperty("siteId");
  });
});

describe("UnitImportView — KISMİ AKTARIM ve sessiz başarı YASAĞI", () => {
  it("🔴 başarılı kısmi aktarım `created` ve `skipped`i AÇIKÇA basar", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-aktar"));

    const sonuc = await screen.findByTestId("excel-form-sonuc");
    expect(within(sonuc).getByTestId("excel-form-sonuc-olusan")).toHaveTextContent("23");
    expect(within(sonuc).getByTestId("excel-form-sonuc-atlanan")).toHaveTextContent("1");
    expect(within(sonuc).getByTestId("excel-form-sonuc-blok")).toHaveTextContent("1");
    expect(within(sonuc).getByTestId("excel-form-sonuc-mesaj")).toHaveTextContent(
      "Kısmi aktarım tamamlandı",
    );
    // 🔴 LİSTEYE GİDİLMEZ: gezinmek bu üç sayıyı görünmeden yok ederdi.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("🔴 hiç satır yazılamadığında 422 AÇIKÇA basılır — sessiz başarı YOK", async () => {
    importAsync.mockRejectedValue(
      new BackendError(422, { detail: "Dosya işlenemedi, 24 satırda hata var" }),
    );
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-aktar"));

    const error = await screen.findByTestId("excel-form-hata");
    expect(error).toHaveTextContent("Dosya işlenemedi, 24 satırda hata var");
    expect(screen.queryByTestId("excel-form-sonuc")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("🔴 `created: 0` ile gelen 200 BAŞARI diye gösterilmez (sözleşme dışı yanıt)", async () => {
    importAsync.mockResolvedValue({
      summary: { total_rows: 24, valid: 0, warning: 0, error: 24 },
      created: 0,
      skipped: 24,
      blocks_created: 0,
      rows: [],
    });
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-aktar"));

    expect(await screen.findByTestId("excel-form-sonuc-bos")).toHaveTextContent(
      IMPORT_NOTHING_IMPORTABLE_MESSAGE,
    );
    expect(screen.queryByTestId("excel-form-sonuc-mesaj")).toBeNull();
  });

  it("🔴 aktarılabilir satır YOKKEN aktar düğmesi KAPALIDIR (boşuna yükleme yaptırılmaz)", async () => {
    validateAsync.mockResolvedValue(
      makeValidation({
        summary: { total_rows: 2, valid: 0, warning: 0, error: 2 },
        rows: [ERROR_ROW],
        blocks_to_create: [],
      }),
    );
    render(<UnitImportView />);
    await fillAndValidate();

    expect(screen.getByTestId("excel-form-aktar")).toBeDisabled();
    expect(screen.getByTestId("excel-form-ozet-serit")).toHaveTextContent(
      IMPORT_NOTHING_IMPORTABLE_MESSAGE,
    );
  });

  it("dosya seçilmeden aktarmaya çalışmak istek KURMAZ", () => {
    render(<UnitImportView />);
    selectProject();
    fireEvent.click(screen.getByTestId("excel-form-aktar"));
    expect(importAsync).not.toHaveBeenCalled();
  });

  it("dosya kaldırılınca doğrulama ve sonuç ATILIR", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    fireEvent.click(screen.getByTestId("excel-form-dosya-kaldir"));

    expect(screen.queryByTestId("excel-form-dosya-ozet")).toBeNull();
    expect(screen.queryByTestId("excel-form-sayaclar")).toBeNull();
    expect(screen.getByTestId("excel-form-dosya-bos")).toBeInTheDocument();
  });
});

describe("UnitImportView — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<UnitImportView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("proje seçilip dosya yüklendi → true", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı aktarma sonrası → false (ORTAK EMİR KURAL 1, B4: sayfadan çıkılmasa da TEMİZ)", async () => {
    render(<UnitImportView />);
    await fillAndValidate();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(screen.getByTestId("excel-form-aktar"));
    await waitFor(() => expect(importAsync).toHaveBeenCalled());
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    // Sayfadan ÇIKILMADI (sonuç ekranda kalır) — bileşen hâlâ MONTE.
    expect(screen.getByTestId("excel-form-govde")).toBeInTheDocument();
  });
});
