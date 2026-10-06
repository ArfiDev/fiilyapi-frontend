import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { TREASURY_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type {
  FinancialInstrumentListResponse,
  FinancialInstrumentResponse,
  FinancialInstrumentSummaryResponse,
} from "@/lib/api/hooks/useFinancialInstruments";
import {
  useFinancialInstruments,
  useFinancialInstrumentSummary,
} from "@/lib/api/hooks/useFinancialInstruments";
import { BackendError } from "@/lib/api/unwrap";

import { FinancialInstrumentsView } from "./FinancialInstrumentsView";

vi.mock("@/lib/api/hooks/useFinancialInstruments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useFinancialInstruments")>()),
  useFinancialInstruments: vi.fn(),
  useFinancialInstrumentSummary: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// F-CEK · form diyaloğu KENDİ dosyasında sınanır (`InstrumentFormModal.test.tsx`);
// burada yalnız AÇILDIĞI ölçülür — gerçek modal iki ek sorgu (proje + banka
// hesabı) açar ve bu ekranın testine `QueryClientProvider` borcu bindirirdi.
vi.mock("./InstrumentFormModal", () => ({
  InstrumentFormModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="fin-form-modal-stub">
      <button type="button" onClick={onClose}>
        stub-kapat
      </button>
    </div>
  ),
}));

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/hazine/cek-senet",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

/** E10:113-160 — mockup'ın BEŞ satırının rakamları birebir. */
function row(partial: Partial<FinancialInstrumentResponse>): FinancialInstrumentResponse {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    instrument_kind: "cheque",
    direction: "received",
    serial_no: "0123456789",
    drawer_name: "Güneşkent A.Ş.",
    description: "Proje iş avansı",
    bank_name: "Ziraat Bank",
    issue_date: "2026-07-01",
    due_date: "2026-07-25",
    amount: "1200000.00",
    status: "portfolio",
    project_id: null,
    bank_account_id: null,
    created_at: null,
    updated_at: null,
    is_due: true,
    ...partial,
  };
}

const ROWS: FinancialInstrumentResponse[] = [
  row({}), // E10:114-122
  row({
    id: "22222222-2222-2222-2222-222222222222",
    serial_no: "0987654321",
    drawer_name: "Çelik Holding",
    description: "Hakediş ödemesi",
    bank_name: "İş Bank",
    issue_date: "2026-06-15",
    due_date: "2026-08-15",
    amount: "850000.00",
    is_due: false,
  }), // E10:123-131
  row({
    id: "33333333-3333-3333-3333-333333333333",
    serial_no: "0234567891",
    drawer_name: "Güneşkent A.Ş.",
    description: "Eski hakediş",
    issue_date: "2026-04-01",
    due_date: "2026-06-01",
    amount: "240000.00",
    status: "collected",
    // 🔴 AYRIŞMA NOKTASI: vadesi geçmiş AMA tahsil edilmiş.
    is_due: true,
  }), // E10:150-158
];

const SUMMARY: FinancialInstrumentSummaryResponse = {
  // E10:72-73 · 77-78 · 82-83 · 87-88 rakamları.
  portfolio_received: { amount: "3600000.00", count: 8 },
  issued: { amount: "1800000.00", count: 5 },
  due_this_month: { amount: "920000.00", count: 3 },
  returned_cancelled: { amount: "240000.00", count: 2 },
  as_of: "2026-07-20",
};

function listResult(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<FinancialInstrumentListResponse, Error>;
}

function summaryResult(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<FinancialInstrumentSummaryResponse, Error>;
}

/**
 * Bilinmezlik kuralı (spec §2.5.3): seviye YOKSA ekran görünür kalır; yalnız
 * açıkça `"none"` okuma kapısını kapatır. Bu yüzden yetki testi `undefined`
 * değil `"none"` kullanır — `{}` ile yazılan bir test hiçbir şey kanıtlamazdı.
 */
function setSession(level: string) {
  // IZN-F6a · modül düzeyi → sayfa izni (mali.hazine + mali.cek_odeme = TREASURY_VIEW/EDIT).
  const pages = pagesFor(TREASURY_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

function list(items: FinancialInstrumentResponse[], total = items.length) {
  return { items, total, limit: 200, offset: 0, as_of: "2026-07-20" };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  setSession("full");
  vi.mocked(useFinancialInstruments).mockReturnValue(listResult({ data: list(ROWS) }));
  vi.mocked(useFinancialInstrumentSummary).mockReturnValue(summaryResult({ data: SUMMARY }));
});

describe("E10:62-66 — başlık şeridi", () => {
  it("breadcrumb ve başlık mockup metnini basar", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.getByText("Hazine · Çek & Senet Yönetimi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Çek & Ödeme" })).toBeInTheDocument();
  });

  /**
   * 🟢 F-CEK · düğme AÇILDI (mockup geldi: `Form - Cek Ekle.dc.html`).
   * Önceki tur DEVRE DIŞIydı ve gerekçesi ekranda yazılıydı.
   */
  it("🔴 E10:65 `+ Çek Ekle` düğmesi ETKİNDİR ve formu AÇAR", async () => {
    const user = userEvent.setup();
    render(<FinancialInstrumentsView />);
    const button = screen.getByTestId("fin-add");
    expect(button).toHaveTextContent("+ Çek Ekle");
    expect(button).toBeEnabled();
    // Devre-dışı turun `title` gerekçesi KALMAMALI — canlı düğmeyi yalanlardı.
    expect(button).not.toHaveAttribute("title");
    expect(screen.queryByTestId("fin-form-modal-stub")).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByTestId("fin-form-modal-stub")).toBeInTheDocument();
  });

  it("form kapanınca diyalog DOM'dan düşer", async () => {
    const user = userEvent.setup();
    render(<FinancialInstrumentsView />);
    await user.click(screen.getByTestId("fin-add"));
    await user.click(screen.getByRole("button", { name: "stub-kapat" }));
    expect(screen.queryByTestId("fin-form-modal-stub")).not.toBeInTheDocument();
  });

  /**
   * 🔴 GÖRÜNÜR GEREKÇE, AÇIKLADIĞI ÖĞEDEN TÜRER (F-PRJTAB/F-KIRA kanonu):
   * devre-dışı turun bandı ekranda KALSAYDI canlı düğmeyi yalanlardı.
   */
  it("🔴 eski `tasarımı bekleniyor` bandı EKRANDA KALMAMIŞTIR", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.queryByTestId("fin-add-reason")).not.toBeInTheDocument();
    expect(screen.queryByText(/tasarımı bekleniyor/)).not.toBeInTheDocument();
  });

  /** Yazma izni AYRI kapıdır: `read` seviyesi listeyi görür, kayıt açamaz. */
  it("🔒 yazma izni yoksa düğme DEVRE DIŞIdır ve gerekçesi taşınır", async () => {
    const user = userEvent.setup();
    setSession("view");
    render(<FinancialInstrumentsView />);
    const button = screen.getByTestId("fin-add");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Çek/senet eklemek için yazma yetkiniz yok.");
    await user.click(button);
    expect(screen.queryByTestId("fin-form-modal-stub")).not.toBeInTheDocument();
  });
});

describe("E10:69-90 — dört özet kartı", () => {
  it("dört kart mockup sırasıyla, tutar VE adetle basılır", () => {
    render(<FinancialInstrumentsView />);
    const cards = within(screen.getByTestId("fin-cards")).getAllByText(
      /Portföydeki Çek|Verilen Çek|Bu Ay Vadeli|İade \/ İptal/,
    );
    expect(cards.map((c) => c.textContent)).toEqual([
      "Portföydeki Çek",
      "Verilen Çek",
      "Bu Ay Vadeli",
      "İade / İptal",
    ]);
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("₺ 3,6M");
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("8 adet");
    expect(screen.getByTestId("fin-card-issued")).toHaveTextContent("₺ 1,8M");
    expect(screen.getByTestId("fin-card-issued")).toHaveTextContent("5 adet");
    expect(screen.getByTestId("fin-card-due")).toHaveTextContent("₺ 920B");
    expect(screen.getByTestId("fin-card-due")).toHaveTextContent("3 adet");
    expect(screen.getByTestId("fin-card-returned")).toHaveTextContent("₺ 240B");
    expect(screen.getByTestId("fin-card-returned")).toHaveTextContent("2 adet");
  });

  /**
   * 🔴 Kart adedi `count` alanındandır, `items.length`ten DEĞİL. Fikstürde
   * liste 3 satır taşır ama "Portföydeki Çek" 8 der — iki sayaç AYRI şeydir
   * (BOR-TEMIZ kanonu). `items.length`e kayan bir mutasyon burada kırmızıdır.
   */
  it("🔴 kart adedi listenin uzunluğundan TÜREMEZ", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.getAllByTestId("fin-row")).toHaveLength(3);
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("8 adet");
  });

  it("özet patlarsa liste YAŞAR (bağımsız kaynaklar)", () => {
    vi.mocked(useFinancialInstrumentSummary).mockReturnValue(
      summaryResult({ isError: true, error: new Error("kart yok") }),
    );
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-summary-error")).toBeInTheDocument();
    expect(screen.getByTestId("fin-table")).toBeInTheDocument();
    // Veri yokken sayı UYDURULMAZ.
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("—");
  });
});

describe("E10:93-97 — üç sekme SÜZGEÇTİR", () => {
  it("varsayılan sekme `Alınan Çekler`tir ve uca received+cheque gider", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-tab-alinan")).toHaveAttribute("aria-current", "page");
    expect(vi.mocked(useFinancialInstruments)).toHaveBeenCalledWith({
      direction: "received",
      instrumentKind: "cheque",
      limit: 200,
    });
  });

  it("`Verilen Çekler` sekmesi URL'i günceller", async () => {
    const user = userEvent.setup();
    render(<FinancialInstrumentsView />);
    await user.click(screen.getByTestId("fin-tab-verilen"));
    expect(replace).toHaveBeenCalledWith("/hazine/cek-senet?sekme=verilen", { scroll: false });
  });

  it("URL `sekme=verilen` iken uca issued+cheque gider", () => {
    searchParams = new URLSearchParams("sekme=verilen");
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-tab-verilen")).toHaveAttribute("aria-current", "page");
    expect(vi.mocked(useFinancialInstruments)).toHaveBeenCalledWith({
      direction: "issued",
      instrumentKind: "cheque",
      limit: 200,
    });
  });

  it("🔴 URL `sekme=senet` iken YÖN SÜZGECİ HİÇ GÖNDERİLMEZ", () => {
    searchParams = new URLSearchParams("sekme=senet");
    render(<FinancialInstrumentsView />);
    expect(vi.mocked(useFinancialInstruments)).toHaveBeenCalledWith({
      instrumentKind: "promissory_note",
      limit: 200,
    });
  });

  it("`Alınan Çekler`e dönünce parametre URL'den SİLİNİR", async () => {
    searchParams = new URLSearchParams("sekme=senet");
    const user = userEvent.setup();
    render(<FinancialInstrumentsView />);
    await user.click(screen.getByTestId("fin-tab-alinan"));
    expect(replace).toHaveBeenCalledWith("/hazine/cek-senet", { scroll: false });
  });
});

describe("E10:99-161 — yedi sütunlu tablo", () => {
  it("sütun başlıkları mockup SIRASIYLA basılır", () => {
    render(<FinancialInstrumentsView />);
    const heads = within(screen.getByTestId("fin-table")).getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual([
      "Çek No",
      "Keşideci",
      "Banka",
      "Keşide Tarihi",
      "Vade",
      "Tutar",
      "Durum",
    ]);
  });

  /**
   * 🔴 KAREYE BAKILARAK BULUNAN KUSUR (yönetim denetimi): "Senetler"
   * sekmesinde başlık "Çek No" kalıyordu ama hücreler senet numarası
   * taşıyordu. Üç sekme için de iddia yazılır — yalnız senet sekmesine bakan
   * bir test, başlığı sabit "Senet No" yapan ters mutasyonu GEÇİRİRDİ.
   */
  it("🔴 seri no sütun başlığı ÜÇ sekmede de doğru basılır", () => {
    const headOf = () =>
      within(screen.getByTestId("fin-table")).getAllByRole("columnheader")[0].textContent;

    const { unmount } = render(<FinancialInstrumentsView />);
    expect(headOf()).toBe("Çek No");
    unmount();

    searchParams = new URLSearchParams("sekme=verilen");
    const verilen = render(<FinancialInstrumentsView />);
    expect(headOf()).toBe("Çek No");
    verilen.unmount();

    searchParams = new URLSearchParams("sekme=senet");
    render(<FinancialInstrumentsView />);
    expect(headOf()).toBe("Senet No");
  });

  it("satır hücreleri mockup biçimleriyle basılır (E10:114-121)", () => {
    render(<FinancialInstrumentsView />);
    const cells = within(screen.getAllByTestId("fin-row")[0]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("0123456789");
    expect(cells[1]).toHaveTextContent("Güneşkent A.Ş.");
    expect(cells[1]).toHaveTextContent("Proje iş avansı"); // açıklama ALT SATIRI
    expect(cells[2]).toHaveTextContent("Ziraat Bank");
    expect(cells[3]).toHaveTextContent("01.07.2026");
    expect(cells[4]).toHaveTextContent("25.07.2026");
    expect(cells[5]).toHaveTextContent("₺ 1.200.000");
  });

  it("🔴 rozet üçlüsü satır satır doğru kurulur", () => {
    render(<FinancialInstrumentsView />);
    const rows = screen.getAllByTestId("fin-row");
    expect(within(rows[0]).getAllByRole("cell")[6]).toHaveTextContent("Vadede");
    expect(within(rows[1]).getAllByRole("cell")[6]).toHaveTextContent("Portföyde");
    expect(within(rows[2]).getAllByRole("cell")[6]).toHaveTextContent("Tahsil Edildi");
  });

  it("🔴 rozetler mockup RENKLERİNİ taşır (turuncu · yeşil · mavi)", () => {
    render(<FinancialInstrumentsView />);
    const rows = screen.getAllByTestId("fin-row");
    expect(within(rows[0]).getByText("Vadede").className).toContain("badge--warning");
    expect(within(rows[0]).getByText("Vadede").className).toContain("fin-badge--due");
    expect(within(rows[1]).getByText("Portföyde").className).toContain("badge--success");
    expect(within(rows[2]).getByText("Tahsil Edildi").className).toContain("badge--primary");
  });

  it("vade hücresinin tonu rozetle AYNI türevden gelir", () => {
    render(<FinancialInstrumentsView />);
    const rows = screen.getAllByTestId("fin-row");
    expect(within(rows[0]).getByText("25.07.2026").className).toContain("fin-table__due--due");
    expect(within(rows[1]).getByText("15.08.2026").className).toContain(
      "fin-table__due--portfolio",
    );
    expect(within(rows[2]).getByText("01.06.2026").className).toContain("fin-table__due--settled");
  });

  it("bankası olmayan kayıt SESSİZCE atlanmaz — `—` basar", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(
      listResult({ data: list([row({ bank_name: null })]) }),
    );
    render(<FinancialInstrumentsView />);
    expect(within(screen.getByTestId("fin-row")).getAllByRole("cell")[2]).toHaveTextContent("—");
  });

  it("boş küme kendi metnini basar", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(listResult({ data: list([]) }));
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-table-empty")).toBeInTheDocument();
  });

  it("liste hatası GÖRÜNÜR, kartlar yaşar", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(
      listResult({ isError: true, error: new Error("liste yok") }),
    );
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-table-error")).toBeInTheDocument();
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("₺ 3,6M");
  });

  /** K5 — mockup sayfalama çizmez; liste SESSİZCE kırpılmaz, bant basar. */
  it("🔴 `total` sayfadan büyükse kırpma bandı GÖRÜNÜR", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(listResult({ data: list(ROWS, 940) }));
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-truncation")).toBeInTheDocument();
  });

  it("kırpma yokken bant BASILMAZ", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.queryByTestId("fin-truncation")).toBeNull();
  });
});

describe("yetki", () => {
  it("izni açıkça `none` olan kullanıcı AccessDenied görür", () => {
    setSession("none");
    render(<FinancialInstrumentsView />);
    expect(screen.queryByTestId("fin-table")).toBeNull();
  });

  it("uçtan 403 gelirse AccessDenied basılır", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(
      listResult({ isError: true, error: new BackendError(403, "yasak") }),
    );
    render(<FinancialInstrumentsView />);
    expect(screen.queryByTestId("fin-table")).toBeNull();
  });
});

describe("görsel spec için yüklendi damgaları", () => {
  it("🔴 damga KAYNAK BAŞINA basılır (tek bayrak ikinciyi gizlerdi)", () => {
    render(<FinancialInstrumentsView />);
    expect(screen.getByTestId("fin-loaded-summary")).toBeInTheDocument();
    expect(screen.getByTestId("fin-loaded-list")).toBeInTheDocument();
  });

  it("liste hâlâ yüklenirken kendi damgası BASILMAZ", () => {
    vi.mocked(useFinancialInstruments).mockReturnValue(listResult({ isLoading: true }));
    render(<FinancialInstrumentsView />);
    expect(screen.queryByTestId("fin-loaded-list")).toBeNull();
    expect(screen.getByTestId("fin-loaded-summary")).toBeInTheDocument();
    expect(screen.getByTestId("fin-loading")).toBeInTheDocument();
  });
});
