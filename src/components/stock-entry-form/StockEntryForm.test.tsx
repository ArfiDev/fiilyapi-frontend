import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { StockEntryForm } from "./StockEntryForm";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useStockItems } from "@/lib/api/hooks/useStockItems";
import { useCreateStockEntry } from "@/lib/api/hooks/useStockMutations";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { useWarehouses } from "@/lib/api/hooks/useWarehouses";
import { fullAccessPages, meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

const PROJECT_ID = "p-1";
const SITE_ID = "s-1";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useWarehouses", () => ({ useWarehouses: vi.fn() }));
vi.mock("@/lib/api/hooks/useStockItems", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockItems")>()),
  useStockItems: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useStockMutations", () => ({ useCreateStockEntry: vi.fn() }));
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));
// IZN-F6a · kapı YALNIZ oturum `pages`inden okunur; her testte
// `sessionPages` ile kurulur (varsayılan = tam erişim, beforeEach).
let sessionPages: ReturnType<typeof fullAccessPages> = fullAccessPages();
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  return {
    ...actual,
    useSession: () => ({
      ...actual.SESSION_CONTEXT_DEFAULT,
      me: meFixture({ pages: sessionPages }),
      isLoading: false,
    }),
  };
});
// 🔴 STOK-BOLUM — atıf seçeneklerinin iki kaynağı.
vi.mock("@/lib/api/hooks/useSiteSections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteSections")>()),
  useSiteSections: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));

const WAREHOUSES = [
  { id: "wh-0", name: "Merkez Depo (Sincan)", site_id: null, created_at: "2025-03-01T08:00:00Z" },
  { id: "wh-1", name: "D-1 Ambar", site_id: SITE_ID, created_at: "2025-03-01T08:01:00Z" },
  { id: "wh-3", name: "D-3 Kapalı", site_id: "s-2", created_at: "2025-03-01T08:03:00Z" },
];

const SECTIONS = [
  { id: "sec-1", code: "A-01", name: "Kat 6–10 Kaba İnşaat" },
  { id: "sec-2", code: null, name: "Zemin Kat" },
];

// 🔴 Bu poz "sec-1"e TAHSİS EDİLMEMİŞTİR ve listede DURMALIDIR (fail-open).
const BOQ_GROUPS = [
  {
    id: "bg-1",
    name: "BETONARME",
    items: [
      { id: "bi-3", code: "02.001", description: "C25/30 Beton" },
      { id: "bi-9", code: "09.999", description: "Tahsis EDILMEMIS poz" },
    ],
  },
];

const ITEMS = [
  {
    id: "it-1",
    code: "SNK-0421",
    name: "Nervürlü Demir Ø12",
    category: "steel" as const,
    unit: "Ton",
    min_stock: "10.000",
    is_active: true,
    created_at: "2025-03-05T08:00:00Z",
  },
];

const mutate = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test yardımcıları hook dönüşlerinin YALNIZ kullanılan alanlarını taklit eder
function stub(value: unknown): any {
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionPages = fullAccessPages();
  vi.mocked(useSite).mockReturnValue(
    stub({ data: { id: SITE_ID, name: "A-Blok Şantiyesi" }, isLoading: false, isError: false }),
  );
  vi.mocked(useWarehouses).mockReturnValue(
    stub({
      data: { items: WAREHOUSES, total: WAREHOUSES.length, limit: 200, offset: 0 },
      isLoading: false,
      isError: false,
    }),
  );
  vi.mocked(useSiteSections).mockReturnValue(
    stub({
      data: { items: SECTIONS, total: SECTIONS.length, limit: 200, offset: 0 },
      isLoading: false,
      isError: false,
    }),
  );
  vi.mocked(useBoq).mockReturnValue(
    stub({ data: { groups: BOQ_GROUPS }, isLoading: false, isError: false }),
  );
  vi.mocked(useStockItems).mockReturnValue(
    stub({
      data: { items: ITEMS, total: ITEMS.length, limit: 200, offset: 0 },
      isLoading: false,
      isError: false,
    }),
  );
  vi.mocked(useUserOptions).mockReturnValue(
    stub({
      options: [{ id: "u-2", full_name: "Sercan Öztürk", title: "Şantiye Şefi" }],
      isLoading: false,
      isError: false,
      isForbidden: false,
    }),
  );
  vi.mocked(useCreateStockEntry).mockReturnValue(stub({ mutate, isPending: false }));
});

/**
 * "Girişi Kaydet" İKİ yerde vardır (mockup 40 üst şerit + 181 alt şerit) ve
 * ikisi de AYNI `handleSubmit`i çağırır — üsttekini kullanmak yeterlidir.
 */
function submitButton(): HTMLElement {
  return screen.getAllByRole("button", { name: "Girişi Kaydet" })[0];
}

function fillValidLine() {
  fireEvent.change(screen.getByTestId("stok-giris-malzeme-0"), { target: { value: "it-1" } });
  fireEvent.change(screen.getByTestId("stok-giris-miktar-0"), { target: { value: "15" } });
  fireEvent.change(screen.getByTestId("stok-giris-fiyat-0"), { target: { value: "21500" } });
}

describe("StockEntryForm — depo ÖN DOLDURMA (rotadan, query parametresi YOK)", () => {
  it("rotadaki şantiyenin deposu seçili gelir", () => {
    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-1");
  });

  it("şantiyenin deposu yoksa GÖRÜNÜR uyarı basılır (sessiz boş seçim yok)", () => {
    vi.mocked(useWarehouses).mockReturnValue(
      stub({
        data: { items: [WAREHOUSES[0]], total: 1, limit: 200, offset: 0 },
        isLoading: false,
        isError: false,
      }),
    );
    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("");
    expect(screen.getByTestId("stok-giris-depo-uyari")).toHaveTextContent("tanımlı depo yok");
  });

  /**
   * M5_3 #325 — `siteQuery` hâlâ yüklenirken (`siteId === ""`) hiçbir depo
   * `site_id === ""` eşleşmez ve eskiden `warehouseNotice` bunu "bu
   * şantiyeye tanımlı depo yok" diye YANLIŞ yorumlardı; kullanıcı gerçekte
   * depo tanımlıyken geçici bir yalan uyarı görürdü.
   */
  it("siteQuery hâlâ yüklenirken YANLIŞ 'tanımlı depo yok' uyarısı BASILMAZ", () => {
    vi.mocked(useSite).mockReturnValue(stub({ data: undefined, isLoading: true, isError: false }));
    render(<StockEntryForm />);

    expect(screen.queryByTestId("stok-giris-depo-uyari")).not.toBeInTheDocument();
  });

  /**
   * M5_3 #326 — #325 ile AYNI kusur sınıfı: `sectionsQuery`/`boqQuery`
   * `siteId` gelene kadar `enabled: false`dır, devre dışı sorguda
   * `isLoading` de `false`e döner. `siteId === ""` iken eskiden
   * `attributionNote` doğrudan "sectionOptions.length === 0" dalına düşüp
   * "Bölüm tanımlı değil" notunu olgusal olmadan basardı.
   */
  it("siteQuery hâlâ yüklenirken YANLIŞ 'bölüm tanımlı değil' notu BASILMAZ — 'yükleniyor' basar", () => {
    vi.mocked(useSite).mockReturnValue(stub({ data: undefined, isLoading: true, isError: false }));
    vi.mocked(useSiteSections).mockReturnValue(
      stub({ data: undefined, isLoading: false, isError: false }),
    );
    vi.mocked(useBoq).mockReturnValue(stub({ data: undefined, isLoading: false, isError: false }));
    render(<StockEntryForm />);

    const note = screen.getByTestId("stok-giris-atif-note");
    expect(note).toHaveTextContent("yükleniyor");
    expect(note).not.toHaveTextContent("tanımlı bölüm yok");
  });

  /**
   * 🔴 YARIŞ — `useSite` ve `useWarehouses` İKİ AYRI sorgudur ve sıraları
   * garanti DEĞİLDİR. Depo listesi ÖNCE gelirse `siteId` o an henüz `""`dır;
   * tohumlama bekçisi o turda "tohumlandı" diye işaretlenirse şantiye kimliği
   * sonradan geldiğinde ön doldurma BİR DAHA denenmez ve form varsayılan
   * deposunu SESSİZCE kaybeder (hata yok, 422 yok — boş kalan bir alan).
   */
  it("🔴 şantiye kimliği depo listesinden SONRA gelirse ön doldurma YİNE yapılır", () => {
    vi.mocked(useSite).mockReturnValue(stub({ data: undefined, isLoading: true, isError: false }));
    const { rerender } = render(<StockEntryForm />);

    // İlk turda şantiye kimliği yok: hiçbir depo eşleşemez.
    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("");

    vi.mocked(useSite).mockReturnValue(
      stub({ data: { id: SITE_ID, name: "A-Blok Şantiyesi" }, isLoading: false, isError: false }),
    );
    rerender(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-1");
  });

  /**
   * 🔴 Yarış onarımının KENDİ riski: tohumlama artık kimliği BEKLEDİĞİ için
   * beklerken kullanıcı depo seçebilir. Geç gelen tohum o seçimi EZMEMELİDİR —
   * yoksa bir sessiz kayıp yerine başkası konmuş olurdu.
   */
  it("🔴 kimlik gelmeden kullanıcı depo seçtiyse geç tohumlama onu EZMEZ", () => {
    vi.mocked(useSite).mockReturnValue(stub({ data: undefined, isLoading: true, isError: false }));
    const { rerender } = render(<StockEntryForm />);

    fireEvent.change(screen.getByTestId("stok-giris-depo"), { target: { value: "wh-0" } });
    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-0");

    vi.mocked(useSite).mockReturnValue(
      stub({ data: { id: SITE_ID, name: "A-Blok Şantiyesi" }, isLoading: false, isError: false }),
    );
    rerender(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-0");
  });

  /**
   * Tohumlamanın "YALNIZ BİR KEZ" sözleşmesi KORUNUR: yarış onarımı, sonraki
   * liste yenilemelerinin kullanıcının seçimini ezmesine kapı AÇMAMALIDIR.
   */
  it("tohumlandıktan sonra liste yenilenirse kullanıcının seçimi EZİLMEZ", () => {
    const { rerender } = render(<StockEntryForm />);
    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-1");

    fireEvent.change(screen.getByTestId("stok-giris-depo"), { target: { value: "wh-0" } });
    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-0");

    // Aynı içerik, YENİ dizi kimliği — efektin bağımlılığı değişir.
    vi.mocked(useWarehouses).mockReturnValue(
      stub({
        data: { items: [...WAREHOUSES], total: WAREHOUSES.length, limit: 200, offset: 0 },
        isLoading: false,
        isError: false,
      }),
    );
    rerender(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-0");
  });
});

describe("StockEntryForm — koşullu 'Kaynak Depo' (spec §5 S4)", () => {
  it("yalnız transfer tipinde görünür", () => {
    render(<StockEntryForm />);

    expect(screen.queryByTestId("stok-giris-kaynak-depo")).toBeNull();

    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);
    expect(screen.getByTestId("stok-giris-kaynak-depo")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stok-giris-tip-adjustment").querySelector("input")!);
    expect(screen.queryByTestId("stok-giris-kaynak-depo")).toBeNull();
  });

  it("hedef depo kaynak listesinden ÇIKARILIR (kendine transfer 422'dir)", () => {
    render(<StockEntryForm />);
    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);

    const options = [...screen.getByTestId("stok-giris-kaynak-depo").querySelectorAll("option")];
    expect(options.map((option) => option.value)).not.toContain("wh-1");
    expect(options.map((option) => option.value)).toContain("wh-0");
  });

  it("kaynak depo seçilmeden gönderilirse istek AÇILMAZ ve Türkçe hata basılır", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);
    fireEvent.click(submitButton());

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("stok-giris-hata")).toHaveTextContent("kaynak depo zorunludur");
  });
});

describe("StockEntryForm — GÖVDE ANAHTAR TESTİ (telden gidecek gövde)", () => {
  it("gönderilen gövde YALNIZ şema anahtarlarını taşır; pending yüzeyler SIZMAZ", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.change(screen.getByTestId("stok-giris-teslim-alan"), { target: { value: "u-2" } });
    fireEvent.click(submitButton());

    expect(mutate).toHaveBeenCalledTimes(1);
    const body = mutate.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual([
      "entry_date",
      "entry_type",
      "lines",
      "received_by_user_id",
      "warehouse_id",
    ]);
    expect(body).not.toHaveProperty("source_warehouse_id");
    expect(Object.keys(body.lines[0]).sort()).toEqual([
      "item_id",
      "quality",
      "quantity",
      "unit_price",
    ]);
  });

  it("transfer gövdesinde kaynak depo GİRER", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);
    fireEvent.change(screen.getByTestId("stok-giris-kaynak-depo"), { target: { value: "wh-0" } });
    fireEvent.click(submitButton());

    expect(mutate.mock.calls[0][0].source_warehouse_id).toBe("wh-0");
  });
  /* ── STOK-BOLUM · SATIR BAZINDA ATIF ─────────────────────────────────── */

  it("atif SECILINCE govdeye SATIR bazinda girer (baslikta DEGIL)", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.change(screen.getByTestId("stok-giris-bolum-0"), { target: { value: "sec-1" } });
    fireEvent.change(screen.getByTestId("stok-giris-poz-0"), { target: { value: "bi-3" } });
    fireEvent.click(submitButton());

    const body = mutate.mock.calls[0][0];
    // 🔴 BAŞLIKTA atıf anahtarı OLMAMALI — etiket SATIR bazındadır.
    expect(body).not.toHaveProperty("section_id");
    expect(body).not.toHaveProperty("boq_item_id");
    expect(body.lines[0].section_id).toBe("sec-1");
    expect(body.lines[0].boq_item_id).toBe("bi-3");
  });

  it("atif BOS birakilirsa anahtar HIC KURULMAZ (null bile gonderilmez)", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(submitButton());

    const line = mutate.mock.calls[0][0].lines[0];
    expect(line).not.toHaveProperty("section_id");
    expect(line).not.toHaveProperty("boq_item_id");
  });

  // 🔴 BU DİLİMİN EN KRİTİK YAPISAL BEKÇİSİ. Backend `transfer` + atıf
  // gövdesini 422 ile reddeder ("transfer tüketim değildir, iki bacaklıdır").
  // Kullanıcı önce "Satınalma"da bölüm seçip SONRA "Transfer"e geçebilir;
  // gövdeye SIZMAMALIDIR.
  it("TRANSFER: onceden secilmis atif govdeye SIZMAZ (422 uretilemez)", () => {
    render(<StockEntryForm />);
    fillValidLine();
    // Önce atıf yapılır (tip "purchase"),
    fireEvent.change(screen.getByTestId("stok-giris-bolum-0"), { target: { value: "sec-1" } });
    fireEvent.change(screen.getByTestId("stok-giris-poz-0"), { target: { value: "bi-3" } });
    // sonra transfere geçilir.
    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);
    fireEvent.change(screen.getByTestId("stok-giris-kaynak-depo"), { target: { value: "wh-0" } });
    fireEvent.click(submitButton());

    const line = mutate.mock.calls[0][0].lines[0];
    expect(line).not.toHaveProperty("section_id");
    expect(line).not.toHaveProperty("boq_item_id");
  });
});

describe("StockEntryForm — atif yuzeyi (STOK-BOLUM)", () => {
  it("TRANSFER'de iki Select DEVRE DISI ve gerekce GORUNUR", () => {
    render(<StockEntryForm />);
    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);

    expect(screen.getByTestId("stok-giris-bolum-0")).toBeDisabled();
    expect(screen.getByTestId("stok-giris-poz-0")).toBeDisabled();
    expect(screen.getByTestId("stok-giris-atif-note")).toHaveTextContent(
      /Transferde bölüm\/iş kalemi atfı yapılmaz/,
    );
  });

  // POZİTİF KONTROL — "her zaman devre dışı" bozuk bir kural da yukarıdaki
  // testi yeşil geçirirdi.
  it("POZITIF KONTROL - transfer DISINDA iki Select ACIKTIR", () => {
    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-bolum-0")).not.toBeDisabled();
    expect(screen.getByTestId("stok-giris-poz-0")).not.toBeDisabled();
  });

  // 🔴 O5b #323 — BOQ ayrı bir izin modülüdür. `boq=none` rolünde
  // `useBoq` 403 döner (`boqQuery.isError = true`) ama Bölüm ucu (`useSiteSections`)
  // kendi izniyle çalışmaya devam edebilir. Tek `attributionDisabled` bayrağı
  // ikisini BİRLİKTE kapatıyordu — Bölüm atfı da SESSİZCE kapanıyordu.
  it("BOQ ucu hataya düşse bile (boq=none) Bölüm Select'i AÇIK kalır", () => {
    vi.mocked(useBoq).mockReturnValue(
      stub({ data: undefined, isLoading: false, isError: true }),
    );

    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-bolum-0")).not.toBeDisabled();
    expect(screen.getByTestId("stok-giris-poz-0")).toBeDisabled();
  });

  // POZİTİF KONTROL — Bölüm ucu kendisi hataya düşerse Bölüm Select'i de kapanmalı.
  it("POZİTİF KONTROL — sections ucu hataya düşerse Bölüm Select'i KAPANIR", () => {
    vi.mocked(useSiteSections).mockReturnValue(
      stub({ data: undefined, isLoading: false, isError: true }),
    );

    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-bolum-0")).toBeDisabled();
  });

  it("tip transfere gecince SECILI atif GORUNUMDEN de silinir (hayalet secim yok)", () => {
    render(<StockEntryForm />);
    fireEvent.change(screen.getByTestId("stok-giris-bolum-0"), { target: { value: "sec-1" } });
    expect(screen.getByTestId("stok-giris-bolum-0")).toHaveValue("sec-1");

    fireEvent.click(screen.getByTestId("stok-giris-tip-transfer").querySelector("input")!);
    expect(screen.getByTestId("stok-giris-bolum-0")).toHaveValue("");

    // Geri dönüldüğünde de geri GELMEZ — silinmiştir, gizlenmemiştir.
    fireEvent.click(screen.getByTestId("stok-giris-tip-purchase").querySelector("input")!);
    expect(screen.getByTestId("stok-giris-bolum-0")).toHaveValue("");
  });

  it("bolum secenekleri santiyenin bolumleridir (kod varsa ada eklenir)", () => {
    render(<StockEntryForm />);

    const select = screen.getByTestId("stok-giris-bolum-0");
    const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(labels).toEqual(["Bölüm atanmadı", "A-01 · Kat 6–10 Kaba İnşaat", "Zemin Kat"]);
  });

  // 🔴 FAIL-OPEN BEKÇİSİ — backend tahsis ARAMAZ ("kayıt, planın rehinesi
  // olmaz") ve istemci bu kararı DARALTMAZ: bölüm seçilse bile poz listesi
  // süzülmez, tahsis edilmemiş poz listede KALIR.
  it("FAIL-OPEN: bolum secilince poz listesi DARALMAZ", () => {
    render(<StockEntryForm />);

    const optionIds = () =>
      Array.from(
        screen.getByTestId("stok-giris-poz-0").querySelectorAll("option"),
      ).map((o) => (o as HTMLOptionElement).value);

    const before = optionIds();
    fireEvent.change(screen.getByTestId("stok-giris-bolum-0"), { target: { value: "sec-1" } });
    expect(optionIds()).toEqual(before);
    // Tahsis EDİLMEMİŞ poz hâlâ seçilebilir.
    expect(optionIds()).toContain("bi-9");
  });

  it("atif ZORUNLU DEGIL - bolumsuz satir kaydedilebilir", () => {
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(submitButton());

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("stok-giris-hata")).not.toBeInTheDocument();
  });
});

describe("StockEntryForm — pending yüzeyler (spec §5 S5)", () => {
  it("'İlgili Sipariş' devre dışıdır ve gerekçesi GÖRÜNÜR", () => {
    render(<StockEntryForm />);

    const order = screen.getByTestId("stok-giris-siparis");
    expect(order).toBeDisabled();
    expect(order).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");
  });

  it("'Sipariş' sütunu gerekçeli '—' basar (mockup'ın 15/500 örnekleri BASILMAZ)", () => {
    render(<StockEntryForm />);

    const cell = screen.getByTestId("stok-giris-siparis-0");
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");
    expect(screen.queryByText("SP-2026-042'den yüklendi")).toBeNull();
  });

  it("oto-bildirim kutucuğu devre dışı ve SEÇİLMEMİŞTİR (bildirim gönderilmeyecek)", () => {
    render(<StockEntryForm />);

    const notify = screen.getByTestId("stok-giris-bildirim");
    expect(notify).toBeDisabled();
    expect(notify).not.toBeChecked();
    expect(notify).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");
  });

  it("belge kutuları yükleme yapmaz; gerekçe görünür (BC form-slot)", () => {
    render(<StockEntryForm />);

    expect(screen.getByText("İrsaliye")).toBeInTheDocument();
    expect(screen.getAllByText("Yakında").length).toBe(3);
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });
});

describe("StockEntryForm — tutar türevi ve satır işlemleri", () => {
  it("tutar ve toplam istemcide TÜRETİLİR", () => {
    render(<StockEntryForm />);
    fillValidLine();

    expect(screen.getByTestId("stok-giris-tutar-0")).toHaveTextContent("322.500");
    expect(screen.getByTestId("stok-giris-toplam")).toHaveTextContent("322.500");
  });

  it("'+ Kalem Ekle' ve 'Stok kartından malzeme seç' satır açar, × siler", () => {
    render(<StockEntryForm />);

    fireEvent.click(screen.getByTestId("stok-giris-kalem-ekle"));
    expect(screen.getByTestId("stok-giris-satir-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stok-giris-kart-sec"));
    expect(screen.getByTestId("stok-giris-satir-2")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stok-giris-satir-sil-2"));
    expect(screen.queryByTestId("stok-giris-satir-2")).toBeNull();
  });

  it("malzeme seçilince birim SUNUCU kartından basılır", () => {
    render(<StockEntryForm />);
    fireEvent.change(screen.getByTestId("stok-giris-malzeme-0"), { target: { value: "it-1" } });

    expect(screen.getByTestId("stok-giris-satir-0")).toHaveTextContent("Ton");
  });
});

describe("StockEntryForm — hata basımı (ST §4b kanonu)", () => {
  it.each([
    [404, "Depo bulunamadı."],
    [422, "Kaynak ve hedef depo aynı olamaz."],
  ])("sunucunun %s gövdesi Türkçe ve GÖRÜNÜR basılır", (status, detail) => {
    mutate.mockImplementation((_body, options) => {
      options.onError(new BackendError(status, { detail }));
    });
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(submitButton());

    expect(screen.getByTestId("stok-giris-hata")).toHaveTextContent(detail);
  });

  it("başarıda şantiye stok sekmesine dönülür", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess({ id: "se-new-1" }));
    render(<StockEntryForm />);
    fillValidLine();
    fireEvent.click(submitButton());

    expect(push).toHaveBeenCalledWith(`/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok`);
  });
});

describe("StockEntryForm — yetki", () => {
  it("yazma izni olmayan kullanıcı formu görmez", () => {
    sessionPages = { "stok.stok_depo": pageGrant("view"), "santiye.stok": pageGrant("view") };
    render(<StockEntryForm />);

    expect(screen.queryByTestId("stok-giris-body")).toBeNull();
  });

  // 🔴 Kapı DOĞRU SAYFALARA bakmalı: stok girişi = `stok.stok_depo` VEYA `santiye.stok` Düzenler (INVENTORY_EDIT).
  // Yanlış anahtara bağlı bir kapı bu üç testten biriyle ayrışır.
  it("yalnız `stok.stok_depo` Düzenler iken form açılır (VEYA kapısı)", () => {
    sessionPages = { "stok.stok_depo": pageGrant("edit"), "santiye.stok": pageGrant("view") };
    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-body")).toBeInTheDocument();
  });

  it("yalnız `santiye.stok` Düzenler iken form açılır (VEYA kapısı)", () => {
    sessionPages = { "stok.stok_depo": pageGrant("view"), "santiye.stok": pageGrant("edit") };
    render(<StockEntryForm />);

    expect(screen.getByTestId("stok-giris-body")).toBeInTheDocument();
  });

  it("stok sayfalarında grant yokken (başka sayfa Düzenler olsa da) form görünmez", () => {
    sessionPages = { "mali.satis": pageGrant("edit") };
    render(<StockEntryForm />);

    expect(screen.queryByTestId("stok-giris-body")).toBeNull();
  });
});

describe("StockEntryForm — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false (OTOMATİK depo ön doldurma dirty SAYILMAZ)", () => {
    render(<StockEntryForm />);
    expect(screen.getByTestId("stok-giris-depo")).toHaveValue("wh-1");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir satır dolduruldu → true", () => {
    render(<StockEntryForm />);
    fillValidLine();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: router.push) → unmount ile false", () => {
    mutate.mockImplementation((_body, options) => options.onSuccess({ id: "se-new-1" }));
    const { unmount } = render(<StockEntryForm />);
    fillValidLine();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    fireEvent.click(submitButton());
    expect(push).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
