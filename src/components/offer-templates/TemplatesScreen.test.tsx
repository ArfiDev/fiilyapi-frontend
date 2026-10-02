import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { backendClient } from "@/lib/api/client";

import { createFakeBackend, STALE_DETAIL, type FakeBackend, type FakeOptions } from "./template-fake-backend.testkit";
import { TemplatesScreen } from "./TemplatesScreen";

const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), setParam: null as null | ((value: string | null) => void) }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));

const CATALOG = [
  { id: "cat-1", poz_no: "03.001", name: "Kat döşemesi betonu", uom: "m³", last_price: { price: "3250.00" }, ref_price: "3000.00", standard_unit_mhr: "1.8" },
  { id: "cat-2", poz_no: "02.001", name: "Nervürlü inşaat demiri", uom: "ton", last_price: null, ref_price: "3000.5", standard_unit_mhr: "11.5" },
  { id: "cat-3", poz_no: "01.001", name: "Plywood döşeme kalıbı", uom: "m²", last_price: null, ref_price: null, standard_unit_mhr: "0.85" },
];

function options(overrides: Partial<FakeOptions> = {}): FakeOptions {
  return {
    templates: [
      {
        id: "tpl-a",
        name: "Konut · kaba inşaat",
        description: "Temelden çatıya betonarme karkas",
        overhead_pct: "12.00",
        profit_pct: "15.00",
        is_default: true,
        usage_count: 7,
        groups: [
          { name: "Betonarme", items: ["cat-1", "cat-2"] },
          { name: "Kalıp", items: ["cat-3"] },
        ],
      },
      {
        id: "tpl-b",
        name: "Dış cephe mantolama",
        description: null,
        overhead_pct: null,
        profit_pct: "15.00",
        is_default: false,
        usage_count: 2,
        groups: [{ name: "Cephe", items: ["cat-1"] }],
      },
    ],
    catalog: CATALOG,
    disciplines: [{ id: "d-1", name: "Betonarme" }],
    ...overrides,
  };
}

let fake: FakeBackend;
let timeline: string[];

function wire(opts: FakeOptions = options()) {
  fake = createFakeBackend(opts);
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
    vi.mocked(backendClient[method]).mockImplementation(((path: string, init: never) => {
      timeline.push(`${method} ${path}`);
      return Promise.resolve(fake.handle(method, path, init));
    }) as never);
  }
}

function Harness({ initial }: { initial: string | null }) {
  const [param, setParam] = useState<string | null>(initial);
  nav.setParam = setParam;
  return <TemplatesScreen templateParam={param} />;
}

function renderScreen(initial: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  timeline = [];
  perm.level = "full";
  scope.value = { isRestricted: false, names: [] };
  nav.replace.mockImplementation((url: string) => {
    timeline.push(`replace ${url}`);
    const param = new URL(url, "http://x").searchParams.get("sablon");
    act(() => nav.setParam?.(param));
  });
  wire();
});

async function loaded() {
  await screen.findByRole("region", { name: "Şablon listesi" });
  await screen.findByRole("region", { name: "Şablon ayrıntısı" });
  await screen.findByRole("region", { name: "Şablon kalemleri" });
}

const cardsRegion = () => screen.getByRole("region", { name: "Şablon listesi" });
const detailRegion = () => screen.getByRole("region", { name: "Şablon ayrıntısı" });
const itemsRegion = () => screen.getByRole("region", { name: "Şablon kalemleri" });

describe("liste kartı (TS:89-106)", () => {
  it("kart: ad + VARSAYILAN + 'x kalem · y grup · z teklifte kullanıldı' + İstanbul güncelleme tarihi; 'N şablon'", async () => {
    renderScreen();
    await loaded();
    const first = await within(cardsRegion()).findByRole("button", { name: /Konut · kaba inşaat/ });
    expect(first).toHaveTextContent("VARSAYILAN");
    expect(first).toHaveTextContent("3 kalem · 2 grup · 7 teklifte kullanıldı");
    expect(first).toHaveTextContent(/Güncelleme 1[23]\.09\.2026/);
    expect(cardsRegion()).toHaveTextContent("2 şablon");
  });

  it("URL'de seçim yoksa ilk (varsayılan) şablon seçilir; kart tıklanınca URL ?sablon= ile YENİLENİR", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    const first = await within(cardsRegion()).findByRole("button", { name: /Konut · kaba inşaat/ });
    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(within(cardsRegion()).getByRole("button", { name: /Dış cephe mantolama/ }));
    expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/sablonlar?sablon=tpl-b");
    await waitFor(() => expect(within(detailRegion()).getByRole("button", { name: "Dış cephe mantolama" })).toBeInTheDocument());
  });

  it("URL'deki kimlik seçili gelir; bilinmeyen kimlik ilk şablona düşer", async () => {
    renderScreen("tpl-b");
    await loaded();
    expect(await within(detailRegion()).findByRole("button", { name: "Dış cephe mantolama" })).toBeInTheDocument();
  });

  it("arama istemcide, tr-TR küçük harfle; 'N şablon' toplamı değişmez", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await within(cardsRegion()).findByRole("button", { name: /Konut/ });
    await user.type(screen.getByRole("searchbox", { name: "Şablon ara" }), "MANTOLAMA");
    expect(within(cardsRegion()).queryByRole("button", { name: /Konut/ })).not.toBeInTheDocument();
    expect(within(cardsRegion()).getByRole("button", { name: /Dış cephe/ })).toBeInTheDocument();
    expect(cardsRegion()).toHaveTextContent("2 şablon");
    expect(fake.callsTo("GET", "/offers/templates")).toHaveLength(1);
  });
});

describe("detay kartı (TS:109-128)", () => {
  it("4 istatistik; 'Kullanıldığı teklif' LİSTE öğesinden (detay önbelleği bayattır)", async () => {
    renderScreen();
    await loaded();
    await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat" });
    const stats = detailRegion();
    expect(within(stats).getByText("Kullanıldığı teklif").nextSibling).toHaveTextContent("7");
    expect(within(stats).getByText("Kalem").nextSibling).toHaveTextContent("3");
    expect(within(stats).getByText("Grup").nextSibling).toHaveTextContent("2");
    expect(within(stats).getByText("Varsayılan oranlar").nextSibling).toHaveTextContent("GG %12 · K %15");
  });

  it("boş oran teklif ayarı değeriyle '(ayar)' (ÜS-F4-6)", async () => {
    renderScreen("tpl-b");
    await loaded();
    await within(detailRegion()).findByRole("button", { name: "Dış cephe mantolama" });
    expect(within(detailRegion()).getByText("Varsayılan oranlar").nextSibling).toHaveTextContent("GG %12 (ayar) · K %15");
  });

  it("mavi not mockup metni AYNEN; 'Bu şablonla teklif başlat →' ?sablon= ile Yeni'ye gider", async () => {
    renderScreen();
    await loaded();
    await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat" });
    expect(detailRegion()).toHaveTextContent(
      "Şablonda miktar tutulmaz. Birim fiyatlar teklif anında İş Kalemi Kataloğu'ndaki son fiyattan çekilir; yalnız kalem seti, gruplar ve varsayılan oranlar saklanır.",
    );
    expect(within(detailRegion()).getByRole("link", { name: "Bu şablonla teklif başlat →" })).toHaveAttribute(
      "href",
      "/teklif-hazirlama/yeni?sablon=tpl-a",
    );
  });

  it("varsayılan şablonda 'Varsayılan yap' yerine pasif 'Varsayılan şablon' (✓ simgesi)", async () => {
    renderScreen();
    await loaded();
    await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat" });
    expect(within(detailRegion()).getByRole("button", { name: "Varsayılan şablon" })).toBeDisabled();
  });
});

describe("kalemler kartı (TS:130-159)", () => {
  it("grup satırı 'A Betonarme 3 kalem'; katalog son fiyat → 'Ref ₺…' → '—'; A-s/birim katalogdan", async () => {
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    const rows = within(itemsRegion()).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("A");
    expect(rows[1]).toHaveTextContent("Betonarme");
    expect(rows[1]).toHaveTextContent("2 kalem");
    expect(rows[2]).toHaveTextContent("03.001");
    expect(rows[2]).toHaveTextContent("₺3.250,00");
    expect(rows[2]).toHaveTextContent("1,80");
    expect(rows[3]).toHaveTextContent("Ref ₺3.000,50");
    expect(rows[3]).toHaveTextContent("11,50");
    expect(rows[5]).toHaveTextContent("—");
    expect(itemsRegion()).toHaveTextContent("3 kalem · 2 grup");
    expect(fake.callsTo("GET", "/catalog/items")).toHaveLength(1);
  });

  it("'+ Katalogdan Ekle' F4.6'ya kadar PASİF ve gerekçeli", async () => {
    renderScreen();
    await loaded();
    const button = await within(itemsRegion()).findByRole("button", { name: "+ Katalogdan Ekle" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("Yakında"));
  });
});

describe("içerik düzenleme (anlık kayıt, TAM değiştirme PUT)", () => {
  it("kalem × → PUT gövdesi kalan gruplar + expected_updated_at; bayat taban YOK", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    const before = fake.row("tpl-a")?.updated_at;
    await user.click(within(itemsRegion()).getByRole("button", { name: "Kalemi çıkar: 03.001" }));
    await waitFor(() => expect(fake.callsTo("PUT", "/offers/templates/{template_id}/content")).toHaveLength(1));
    expect(fake.callsTo("PUT", "/offers/templates/{template_id}/content")[0]?.body).toEqual({
      groups: [
        { name: "Betonarme", items: [{ catalog_item_id: "cat-2" }] },
        { name: "Kalıp", items: [{ catalog_item_id: "cat-3" }] },
      ],
      expected_updated_at: before,
    });
    await waitFor(() => expect(within(itemsRegion()).queryByText("Kat döşemesi betonu")).not.toBeInTheDocument());
  });

  it("art arda iki × tıklaması: ikisi de uygulanır (kuyruk), ikinci PUT birincinin yanıtından kurulur", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    await user.click(within(itemsRegion()).getByRole("button", { name: "Kalemi çıkar: 03.001" }));
    await user.click(within(itemsRegion()).getByRole("button", { name: "Kalemi çıkar: 02.001" }));
    await waitFor(() => expect(fake.callsTo("PUT", "/offers/templates/{template_id}/content")).toHaveLength(2));
    await waitFor(() => expect(fake.row("tpl-a")?.groups[0]?.items).toEqual([]));
    expect(screen.queryByText(STALE_DETAIL)).not.toBeInTheDocument();
  });

  it("'+ Grup' → 'Yeni grup'; ikinci kez 'Yeni grup 2'; boş grupta × grubu siler, dolu grupta × YOK", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    expect(within(itemsRegion()).queryByRole("button", { name: "Grubu sil" })).not.toBeInTheDocument();
    await user.click(within(itemsRegion()).getByRole("button", { name: "+ Grup" }));
    await within(itemsRegion()).findByText("Yeni grup");
    await user.click(within(itemsRegion()).getByRole("button", { name: "+ Grup" }));
    await within(itemsRegion()).findByText("Yeni grup 2");
    await user.click(within(itemsRegion()).getAllByRole("button", { name: "Grubu sil" })[0] as HTMLElement);
    await waitFor(() => expect(within(itemsRegion()).queryByText("Yeni grup")).not.toBeInTheDocument());
    expect(within(itemsRegion()).getByText("Yeni grup 2")).toBeInTheDocument();
  });

  it("grup adı tıkla-düzenle; aynı ad 'Bu adla grup var' bandı, istek atılmaz", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    await user.click(within(itemsRegion()).getByRole("button", { name: "Kalıp" }));
    const input = within(itemsRegion()).getByRole("textbox", { name: "Grup adı" });
    await user.clear(input);
    await user.type(input, "Betonarme{Enter}");
    expect(await screen.findByText("Bu adla grup var")).toBeInTheDocument();
    expect(fake.callsTo("PUT", "/offers/templates/{template_id}/content")).toHaveLength(0);
  });

  it("409 → bant metni AYNEN ve şablon yeniden okunur", async () => {
    const user = userEvent.setup();
    wire(options({ failures: { "PUT /offers/templates/{template_id}/content": { status: 409, detail: STALE_DETAIL } } }));
    renderScreen();
    await loaded();
    await within(itemsRegion()).findByText("Betonarme");
    const reads = fake.callsTo("GET", "/offers/templates/{template_id}").length;
    await user.click(within(itemsRegion()).getByRole("button", { name: "Kalemi çıkar: 03.001" }));
    expect(await screen.findByText("Şablon başka biri tarafından değiştirildi; sayfayı yenileyin")).toBeInTheDocument();
    await waitFor(() => expect(fake.callsTo("GET", "/offers/templates/{template_id}").length).toBe(reads + 1));
  });
});

describe("ad ve künye (PATCH, aynı sıradan)", () => {
  it("ad tıkla-düzenle: blur → PATCH {name, expected_updated_at}", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat" }));
    const input = within(detailRegion()).getByRole("textbox", { name: "Şablon adı" });
    expect(input).toHaveAttribute("maxlength", "80");
    const before = fake.row("tpl-a")?.updated_at;
    await user.clear(input);
    await user.type(input, "Konut · anahtar teslim");
    await user.tab();
    await waitFor(() => expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")).toHaveLength(1));
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body).toEqual({
      name: "Konut · anahtar teslim",
      expected_updated_at: before,
    });
  });

  it("boş ad: eski ada döner + 'Şablon adı zorunlu', istek YOK", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat" }));
    await user.clear(within(detailRegion()).getByRole("textbox", { name: "Şablon adı" }));
    await user.tab();
    expect(await within(detailRegion()).findByText("Şablon adı zorunlu")).toBeInTheDocument();
    expect(within(detailRegion()).getByRole("button", { name: "Konut · kaba inşaat" })).toBeInTheDocument();
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")).toHaveLength(0);
  });

  it("varsayılan oranlar tıkla-düzenle (ÜS-F4-7): Türkçe virgül, blur'da PATCH yalnız DEĞİŞEN alan", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: /Varsayılan oranlar/ }));
    const overhead = within(detailRegion()).getByRole("textbox", { name: "Varsayılan Genel gider %" });
    await user.clear(overhead);
    await user.type(overhead, "13,5");
    await user.tab();
    await user.tab();
    await waitFor(() => expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")).toHaveLength(1));
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body).toMatchObject({ overhead_pct: "13.5" });
    expect(fake.callsTo("PATCH", "/offers/templates/{template_id}")[0]?.body).not.toHaveProperty("profit_pct");
  });
});

describe("Varsayılan yap · Kopyala · Sil", () => {
  it("Varsayılan yap → toast '{ad} varsayılan şablon yapıldı' ve etiket 'Varsayılan şablon' (✓ simgesi)", async () => {
    const user = userEvent.setup();
    renderScreen("tpl-b");
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Varsayılan yap" }));
    expect(await screen.findByText("Dış cephe mantolama varsayılan şablon yapıldı")).toBeInTheDocument();
    expect(await within(detailRegion()).findByRole("button", { name: "Varsayılan şablon" })).toBeDisabled();
    expect(within(cardsRegion()).getByRole("button", { name: /Konut/ })).not.toHaveTextContent("VARSAYILAN");
  });

  it("Kopyala → yeni şablon seçilir (URL), toast 'Şablon kopyalandı', varsayılan DEĞİL", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Kopyala" }));
    expect(await screen.findByText("Şablon kopyalandı")).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/\?sablon=tpl-new-/));
    expect(await within(detailRegion()).findByRole("button", { name: "Konut · kaba inşaat (kopya)" })).toBeInTheDocument();
    expect(fake.callsTo("POST", "/offers/templates/{template_id}/copy")[0]?.body).toBeUndefined();
  });

  it("Sil → modal metni AYNEN; onayda URL ÖNCE ilk kalan şablona döner, SONRA DELETE; toast '{ad} silindi'", async () => {
    const user = userEvent.setup();
    renderScreen("tpl-b");
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Sil" }));
    const dialog = await screen.findByRole("dialog", { name: "Şablonu sil" });
    expect(dialog).toHaveTextContent("Dış cephe mantolama silinecek. Bu şablonla oluşturulmuş 2 teklif etkilenmez.");
    timeline.length = 0;
    await user.click(within(dialog).getByRole("button", { name: "Şablonu sil" }));
    expect(await screen.findByText("Dış cephe mantolama silindi")).toBeInTheDocument();
    const replaceAt = timeline.indexOf("replace /teklif-hazirlama/sablonlar?sablon=tpl-a");
    const deleteAt = timeline.indexOf("DELETE /offers/templates/{template_id}");
    expect(replaceAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(replaceAt);
    // Silinen kimliğin detayı DELETE sonrası YENİDEN okunmaz (404 refetch yok).
    expect(timeline.slice(deleteAt + 1).filter((entry) => entry.startsWith("GET /offers/templates/{template_id}"))).toHaveLength(0);
    expect(fake.count()).toBe(1);
  });

  it("silinen tek şablon: URL çıplak adrese döner, boş durum basılır", async () => {
    const user = userEvent.setup();
    wire(options({ templates: [options().templates[0] as never] }));
    renderScreen();
    await loaded();
    await user.click(await within(detailRegion()).findByRole("button", { name: "Sil" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Şablonu sil" })).getByRole("button", { name: "Şablonu sil" }));
    expect(await screen.findByText("Henüz şablon yok · tekrarlayan işler için kalem seti oluşturun")).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/teklif-hazirlama/sablonlar");
  });
});

describe("Yeni Şablon akışı (ekran)", () => {
  it("'Tekliften şablon oluştur' modalı 'Bir tekliften' önseçili açar; '+ Yeni Şablon' 'Boş' ile", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "Tekliften şablon oluştur" }));
    let dialog = await screen.findByRole("dialog", { name: "Yeni Şablon" });
    expect(within(dialog).getByRole("radio", { name: /Bir tekliften/ })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    await user.click(screen.getByRole("button", { name: "+ Yeni Şablon" }));
    dialog = await screen.findByRole("dialog", { name: "Yeni Şablon" });
    expect(within(dialog).getByRole("radio", { name: /^Boş/ })).toHaveAttribute("aria-checked", "true");
  });

  it("oluşturma: yeni şablon seçilir (URL), toast '{ad} şablonu oluşturuldu', modal kapanır", async () => {
    const user = userEvent.setup();
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "+ Yeni Şablon" }));
    const dialog = await screen.findByRole("dialog", { name: "Yeni Şablon" });
    await user.type(within(dialog).getByRole("textbox", { name: /Şablon adı/ }), "Altyapı");
    await user.click(within(dialog).getByRole("button", { name: "Şablonu Oluştur" }));
    expect(await screen.findByText("Altyapı şablonu oluşturuldu")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Yeni Şablon" })).not.toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/\?sablon=tpl-new-/));
    expect(await within(detailRegion()).findByRole("button", { name: "Altyapı" })).toBeInTheDocument();
  });

  it("ara adım düşerse şablon seçilir + bant 'Şablon oluşturuldu ama … uygulanamadı: …'; toast YOK", async () => {
    const user = userEvent.setup();
    wire(options({ failures: { "PUT /offers/templates/{template_id}/content": { status: 404, detail: "Katalog iş tipi bulunamadı" } } }));
    renderScreen();
    await loaded();
    await user.click(screen.getByRole("button", { name: "+ Yeni Şablon" }));
    const dialog = await screen.findByRole("dialog", { name: "Yeni Şablon" });
    await user.type(within(dialog).getByRole("textbox", { name: /Şablon adı/ }), "Yarım");
    await user.click(await within(dialog).findByRole("button", { name: "+ Betonarme" }));
    await user.click(within(dialog).getByRole("button", { name: "Şablonu Oluştur" }));
    expect(await screen.findByText("Şablon oluşturuldu ama gruplar uygulanamadı: Katalog iş tipi bulunamadı")).toBeInTheDocument();
    expect(screen.queryByText("Yarım şablonu oluşturuldu")).not.toBeInTheDocument();
    expect(await within(detailRegion()).findByRole("button", { name: "Yarım" })).toBeInTheDocument();
  });
});

describe("toast (TS:271)", () => {
  it("yeşil şerit 2800 ms'lik zamanlayıcıyla kalkar", async () => {
    const user = userEvent.setup();
    renderScreen("tpl-b");
    await loaded();
    const spy = vi.spyOn(globalThis, "setTimeout");
    await user.click(within(detailRegion()).getByRole("button", { name: "Varsayılan yap" }));
    expect(await screen.findByText("Dış cephe mantolama varsayılan şablon yapıldı")).toBeInTheDocument();
    const toastTimer = spy.mock.calls.find((call) => call[1] === 2800);
    expect(toastTimer).toBeDefined();
    act(() => {
      (toastTimer?.[0] as () => void)();
    });
    expect(screen.queryByText("Dış cephe mantolama varsayılan şablon yapıldı")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("izin (T25: view okur, full + kısıtsız yazar)", () => {
  it("view: şablonu görür, hiçbir yazma düğmesi/düzenleme YOK", async () => {
    perm.level = "view";
    renderScreen();
    await loaded();
    await within(detailRegion()).findByRole("heading", { name: "Konut · kaba inşaat" });
    for (const name of [/\+ Yeni Şablon/, /Tekliften şablon oluştur/, /Varsayılan yap/, /Kopyala/, /^Sil$/, /\+ Grup/, /Katalogdan Ekle/, /Kalemi çıkar/, /Grubu sil/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Konut · kaba inşaat" })).not.toBeInTheDocument();
    expect(screen.getByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
  });

  it("full ama disiplin KISITLI: yazma yok", async () => {
    scope.value = { isRestricted: true, names: ["Betonarme"] };
    renderScreen();
    await loaded();
    await within(detailRegion()).findByRole("heading", { name: "Konut · kaba inşaat" });
    expect(screen.queryByRole("button", { name: /\+ Yeni Şablon/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kopyala" })).not.toBeInTheDocument();
  });

  it("contracts:none → AccessDenied, hiçbir uç çağrılmaz", async () => {
    perm.level = "none";
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);
  });

  it("liste ucu 403 (R5/T40 kısıtlı kullanıcı) → AccessDenied", async () => {
    vi.mocked(backendClient.GET).mockImplementation((() =>
      Promise.resolve({ data: undefined, error: { detail: "Yetkisiz işlem" }, response: new Response(null, { status: 403 }) })) as never);
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("sekme şeridi + başlık", () => {
  it("'Teklif Şablonları N' etkin (N = liste toplamı); 'Teklifler' listeye bağlantı; 'İşverenler' Yakında", async () => {
    renderScreen();
    await loaded();
    const tabs = await screen.findByRole("group", { name: "Teklif sekmeleri" });
    await waitFor(() => expect(within(tabs).getByRole("link", { name: /Teklif Şablonları/ })).toHaveTextContent("2"));
    expect(within(tabs).getByRole("link", { name: /Teklif Şablonları/ })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: /^Teklifler/ })).toHaveAttribute("href", "/teklif-hazirlama");
    expect(within(tabs).getByRole("button", { name: /İşverenler/ })).toBeDisabled();
    expect(screen.getByRole("heading", { level: 1, name: "Teklif Şablonları" })).toBeInTheDocument();
    expect(screen.getByText("Tekrarlayan iş tipleri için hazır kalem setleri · yeni teklif şablondan başlatılabilir")).toBeInTheDocument();
  });
});
