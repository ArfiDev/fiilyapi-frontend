import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import type { AccessLevel } from "@/lib/auth/permissions";

import {
  BETON,
  DEMIR,
  DUV,
  INC,
  KAB,
  KALIP_WITH_ACTUAL,
  SIVA,
  fail,
  mockGets,
  ok,
  renderScreen,
} from "./catalog-test-utils";
import { evMe } from "../ev-session.testkit";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

// Ekran kapıyı `level`den `hasAtLeast` ile kurar; canWrite/canDelete bilerek
// hep true — "full kapısı view'e/draft'a inerse" testler bunu yakalamalı.
let permissionLevel: AccessLevel | undefined = "full";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({
    level: permissionLevel,
    canView: true,
    canWrite: true,
    canDelete: true,
  }),
}));
// IZN-F6a.3 · kapılar oturum sayfa izinlerinden okunur; eski seviye niyeti `permissionLevel`den türetilir
// (draft = salt okunur: katalog/disiplin yazma eşiği full).
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: evMe(permissionLevel === "draft" ? "view" : permissionLevel), isLoading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  permissionLevel = "full";
  mockGets({ disciplines: [KAB, DUV, INC], catalog: [BETON, DEMIR, SIVA] });
});

function catalogGetCount(): number {
  const calls = vi.mocked(backendClient.GET).mock.calls as unknown as ReadonlyArray<readonly unknown[]>;
  return calls.filter((call) => call[0] === "/earned-value/catalog").length;
}

function chipTexts(): string[] {
  const list = screen.getByRole("list", { name: "Katalog özeti" });
  return within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
}

function rowOf(name: string): HTMLElement {
  const cell = screen.getByRole("button", { name });
  const row = cell.closest("tr");
  if (!row) throw new Error(`satır yok: ${name}`);
  return row;
}

describe("poz no (ÜS-12)", () => {
  it("İş tipi hücresinde adın ÜSTÜNDE poz no gösterilir; kolon sayısı 10 kalır", async () => {
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });
    const row = rowOf("Beton döküm");
    const cell = within(row).getByText("KAB-0001").closest("td");
    expect(cell).toBe(screen.getByRole("button", { name: "Beton döküm" }).closest("td"));
    const text = cell?.textContent ?? "";
    expect(text.indexOf("KAB-0001")).toBeLessThan(text.indexOf("Beton döküm"));
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
  });
});

describe("liste (KAT:129-176)", () => {
  it("başlık, üst çipler ve satır hücreleri — B1'de gerçekleşen boş: 'veri yok' ve '—'", async () => {
    renderScreen();

    expect(await screen.findByRole("button", { name: "Beton döküm" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Birim Oran Kataloğu" })).toBeInTheDocument();
    expect(chipTexts()).toEqual([
      "3 iş tipi",
      "0 iş tipinde gerçekleşen veri",
      "0 iş tipi standarttan %10+ farklı",
      "Tamamlanan şantiye 0",
    ]);

    const row = within(rowOf("Beton döküm"));
    expect(row.getByText("C30 pompa ile döküm + vibrasyon")).toBeInTheDocument();
    expect(row.getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(row.getByText("m³")).toBeInTheDocument();
    expect(row.getByText("1,80")).toBeInTheDocument();
    expect(row.getByText("Kendi")).toBeInTheDocument();
    expect(row.getByText(/veri yok/)).toBeInTheDocument();
    expect(row.getByText("14.03.2026")).toBeInTheDocument();
    expect(row.getByText("4")).toBeInTheDocument();
    // ↺ yalnız ortalama varken — B1'de hiç görünmez
    expect(row.queryByRole("button", { name: "Gerçekleşeni standart yap" })).not.toBeInTheDocument();

    // ≥ 10 → 1 ondalık (KAT:410)
    expect(within(rowOf("Demir")).getByText("11,5")).toBeInTheDocument();
    expect(within(rowOf("İç sıva")).getByText("Taşeron")).toBeInTheDocument();
  });

  it("gerçekleşen dolu satır: ortalama, aralık, şantiye sayısı ve kırmızı fark rozeti", async () => {
    mockGets({ disciplines: [KAB, DUV], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();

    await screen.findByRole("button", { name: "Kalıp" });
    const row = within(rowOf("Kalıp"));
    expect(row.getByText("0,93")).toBeInTheDocument();
    expect(row.getByText("0,89–0,95")).toBeInTheDocument();
    expect(row.getByText(/2 şantiye/)).toBeInTheDocument();
    const badge = row.getByText("+%15,7");
    expect(badge).toHaveClass("ev-cat-diff--over");
    expect(chipTexts()[2]).toBe("1 iş tipi standarttan %10+ farklı");
    expect(chipTexts()[3]).toBe("Tamamlanan şantiye 2");
  });
});

describe("süzgeçler (KAT:100-122, 484)", () => {
  it("arama ada göre süzer; eşleşme yoksa boş metni basar", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });

    await user.type(screen.getByPlaceholderText("İş tipi ara"), "beton");
    expect(screen.getByRole("button", { name: "Beton döküm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demir" })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("İş tipi ara"));
    await user.type(screen.getByPlaceholderText("İş tipi ara"), "zzz");
    expect(screen.getByText("Filtreye uyan iş tipi yok.")).toBeInTheDocument();
  });

  it("disiplin açılır listesi sayılarla gelir ve seçilen disipline süzer", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });

    await user.click(screen.getByRole("button", { name: "Disiplin süzgeci: Tüm disiplinler" }));
    const menu = screen.getByRole("dialog", { name: "Disiplin seç" });
    expect(within(menu).getByRole("button", { name: /Tüm disiplinler\s*3/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /Kaba İnşaat\s*2/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: /Duvar & Sıva\s*1/ }));

    expect(screen.queryByRole("dialog", { name: "Disiplin seç" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disiplin süzgeci: Duvar & Sıva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İç sıva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Beton döküm" })).not.toBeInTheDocument();
  });

  it("'Yalnız farkı büyük olanlar' ±%10 dışını bırakır", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [KAB], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();
    await screen.findByRole("button", { name: "Kalıp" });

    const toggle = screen.getByRole("button", { name: "Yalnız farkı büyük olanlar" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Kalıp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Beton döküm" })).not.toBeInTheDocument();
  });
});

describe("satır açma (KAT:178-218)", () => {
  it("B1: gerçekleşen yoksa 'Henüz gerçekleşen yok' satırı ve boş grafik", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });

    const toggle = screen.getByRole("button", { name: "Beton döküm ayrıntıları" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByText("Henüz gerçekleşen yok")).toBeInTheDocument();
    expect(screen.getByText("ilk tamamlanan şantiyede oluşur")).toBeInTheDocument();
    expect(screen.getByText("Dağılım · a-s/m³")).toBeInTheDocument();
    expect(screen.getByText("std 1,80")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByText("Henüz gerçekleşen yok")).not.toBeInTheDocument();
  });

  it("gerçekleşen dolu: şantiye satırları + miktar ağırlıklı ortalama satırı + noktalar", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [KAB], catalog: [KALIP_WITH_ACTUAL] });
    const { container } = renderScreen();
    await user.click(await screen.findByRole("button", { name: "Kalıp ayrıntıları" }));

    const region = screen.getByRole("region", { name: "Kalıp gerçekleşen şantiyeler" });
    const detail = within(within(region).getByRole("table"));
    expect(detail.getByText("Güneşkent B-Blok")).toBeInTheDocument();
    expect(detail.getByText("14.03.2026")).toBeInTheDocument();
    expect(detail.getByText("12.400 m²")).toBeInTheDocument();
    expect(detail.getByText("+%18,8")).toBeInTheDocument(); // (0,95 − 0,80) ÷ 0,80
    expect(detail.getByText("Ortalama · 2 şantiye")).toBeInTheDocument();
    expect(detail.getByText("miktar ağırlıklı")).toBeInTheDocument();
    expect(container.querySelectorAll(".ev-cat-plot__point")).toHaveLength(2);
    // İpucu varsayılanı: en yüksek nokta (KAT:460)
    expect(within(region).getByRole("img", { name: /Dağılım: standart 0,80, ortalama 0,93/ })).toBeInTheDocument();
    expect(region.querySelector(".chart-tooltip__title")?.textContent).toBe("Güneşkent B-Blok");
  });
});

describe("İş Tipi Ekle / Düzenle formu (KAT:234-296)", () => {
  it("boş kayıt: '2 alan eksik' ve POST YOK", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));

    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(within(dialog).getByText("2 alan eksik ya da hatalı.")).toBeInTheDocument();
    expect(within(dialog).getByText("İş tipi adı zorunlu")).toBeInTheDocument();
    expect(within(dialog).getByText("Standart oran zorunlu · 0'dan büyük olmalı")).toBeInTheDocument();
    expect(backendClient.POST).not.toHaveBeenCalled();
  });

  it("sıfır oran reddedilir", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    await user.type(within(dialog).getByLabelText("İş tipi adı"), "Seramik");
    await user.type(within(dialog).getByLabelText("Standart oran"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(within(dialog).getByText("1 alan eksik ya da hatalı.")).toBeInTheDocument();
    expect(backendClient.POST).not.toHaveBeenCalled();
  });

  it("geçerli ekleme: disiplin seçimi varsayılan yapanı disiplinden alır; gövde POST edilir", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ ...SIVA, id: "i-new", name: "Seramik kaplama" }, 201));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    await user.type(within(dialog).getByLabelText("İş tipi adı"), "Seramik kaplama");
    await user.click(within(within(dialog).getByRole("group", { name: "Disiplin" })).getByRole("button", { name: /Duvar & Sıva/ }));
    expect(within(within(dialog).getByRole("group", { name: "Varsayılan yapan" })).getByRole("button", { name: "Taşeron" })).toHaveAttribute("aria-pressed", "true");
    await user.selectOptions(within(dialog).getByLabelText("Birim"), "m²");
    await user.type(within(dialog).getByLabelText("Standart oran"), "1,25");
    await user.type(within(dialog).getByLabelText("Açıklama"), "Yapıştırıcı dahil");
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/catalog", {
        body: {
          discipline_id: "d-duv",
          name: "Seramik kaplama",
          uom: "m²",
          standard_unit_mhr: "1.25",
          default_contractor_type: "subcon",
          description: "Yapıştırıcı dahil",
        },
      }),
    );
    expect(await screen.findByText("Seramik kaplama kataloğa eklendi")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "İş Tipi Ekle" })).not.toBeInTheDocument();
  });

  it("409 (aynı disiplinde aynı ad + birim) mesajı formda kalır", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(409, "Bu disiplinde aynı ad ve birimle bir iş tipi zaten var"));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    await user.type(within(dialog).getByLabelText("İş tipi adı"), "Beton döküm");
    await user.type(within(dialog).getByLabelText("Standart oran"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(await within(dialog).findByText("Bu disiplinde aynı ad ve birimle bir iş tipi zaten var")).toBeInTheDocument();
  });

  it("düzenleme: form mevcut değerle açılır, yalnız DEĞİŞEN alan PATCH edilir", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...BETON, standard_unit_mhr: "2.05" }));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Beton döküm" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Düzenle" });

    expect(await within(dialog).findByDisplayValue("Beton döküm")).toBeInTheDocument();
    const rate = await within(dialog).findByDisplayValue("1,80");
    await user.clear(rate);
    await user.type(rate, "2,05");
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(backendClient.PATCH).toHaveBeenCalledWith("/earned-value/catalog/{item_id}", {
        params: { path: { item_id: "i-bet" } },
        body: { standard_unit_mhr: "2.05" },
      }),
    );
  });

  it("düzenleme: açıklama silinirse null gönderilir (temizle)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...BETON, description: null }));
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Beton döküm" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Düzenle" });

    await user.clear(await within(dialog).findByDisplayValue("C30 pompa ile döküm + vibrasyon"));
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(backendClient.PATCH).toHaveBeenCalledWith("/earned-value/catalog/{item_id}", {
        params: { path: { item_id: "i-bet" } },
        body: { description: null },
      }),
    );
  });

  it("oluşturmada kullanım/gerçekleşen kutusu ve oran uyarı bandı YOK", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    expect(within(dialog).queryByText("Standart son güncelleme")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Bu iş tipini kullanan/)).not.toBeInTheDocument();
  });

  it("düzenlemede kullanım/gerçekleşen kutusu: son güncelleme, kullanım, ort./min/max + fark rozeti (KAT:113-118)", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [KAB, DUV], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Kalıp" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Düzenle" });

    expect(within(dialog).getByText("Standart son güncelleme")).toBeInTheDocument();
    expect(within(dialog).getByText("14.03.2026")).toBeInTheDocument();
    expect(
      within(dialog).getByText((_, el) => el?.className === "ev-cat-use-value" && el.textContent === "4 şantiyede kullanılıyor"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Gerçekleşen · 2 tamamlanan şantiye")).toBeInTheDocument();
    expect(within(dialog).getByText("0,93")).toBeInTheDocument();
    expect(within(dialog).getByText("+%15,7")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        (_, el) => el?.className === "ev-cat-use-muted" && /en düşük 0,89 · en yüksek 0,95 a-s\/m²/.test(el.textContent ?? ""),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("0,89")).toBeInTheDocument();
    expect(within(dialog).getByText("0,95")).toBeInTheDocument();
    // Oran henüz değiştirilmedi → uyarı bandı YOK.
    expect(within(dialog).queryByText(/Bu iş tipini kullanan/)).not.toBeInTheDocument();
  });

  it("oran değiştirilince uyarı bandı basılır; geri alınca kaybolur (KAT:120-122)", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [KAB, DUV], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Kalıp" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Düzenle" });

    const rate = within(dialog).getByLabelText("Standart oran");
    await user.clear(rate);
    await user.type(rate, "1,00");

    expect(within(dialog).getByText(/Bu iş tipini kullanan/)).toBeInTheDocument();
    expect(within(dialog).getByText("4 şantiye")).toBeInTheDocument();

    await user.clear(rate);
    await user.type(rate, "0,80");
    expect(within(dialog).queryByText(/Bu iş tipini kullanan/)).not.toBeInTheDocument();
  });

  it("ad ve açıklama karakter sayaçları (KAT:126,188)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    expect(within(dialog).getByText("0/120")).toBeInTheDocument();
    expect(within(dialog).getByText("0/2000")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("İş tipi adı"), "Seramik");
    expect(within(dialog).getByText("7/120")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Açıklama"), "abc");
    expect(within(dialog).getByText("3/2000")).toBeInTheDocument();
  });

  it("varsayılan yapan ipucu disipline göre dinamik, değiştirilince not düşer (KAT:184)", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [KAB, DUV], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "Kalıp" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Düzenle" });

    expect(within(dialog).getByText("Varsayılan KAB disiplininden: Kendi")).toBeInTheDocument();
    await user.click(within(within(dialog).getByRole("group", { name: "Varsayılan yapan" })).getByRole("button", { name: "Taşeron" }));
    expect(
      within(dialog).getByText("Varsayılan KAB disiplininden: Kendi · bu iş tipinde değiştirildi"),
    ).toBeInTheDocument();
  });

  it("disiplin çipi renk noktası + kod gösterir (KAT:133-149)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: "+ Yeni iş tipi" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });
    const group = within(dialog).getByRole("group", { name: "Disiplin" });

    expect(within(group).getByRole("button", { name: /KAB Kaba İnşaat/ })).toBeInTheDocument();
  });

  it("'disiplin yok': boş durum kutusu basılır, çip listesi YOK (KAT:150-156)", async () => {
    const user = userEvent.setup();
    mockGets({ disciplines: [], catalog: [] });
    renderScreen();
    await user.click(await screen.findAllByRole("button", { name: "+ Yeni iş tipi" }).then((buttons) => buttons[0]));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi Ekle" });

    expect(within(dialog).getByText("Önce disiplin ekleyin")).toBeInTheDocument();
    expect(within(dialog).getByText("Katalogda henüz disiplin yok · iş tipi bir disipline bağlı olmalı")).toBeInTheDocument();
    expect(within(dialog).queryByRole("group", { name: "Disiplin" })).not.toBeInTheDocument();
  });
});

describe("↺ gerçekleşeni standart yap (KAT:153-173)", () => {
  it("B1'de 409 döner → mesaj popover'da; önbellek değişmez", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(409, "Bu iş tipi için tamamlanmış şantiye gerçekleşeni yok"));
    mockGets({ disciplines: [KAB], catalog: [KALIP_WITH_ACTUAL] });
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Gerçekleşeni standart yap" }));
    const pop = screen.getByRole("dialog", { name: "Gerçekleşeni standart yap" });
    expect(within(pop).getByText("Gerçekleşeni (0,93) standart yap?")).toBeInTheDocument();
    await user.click(within(pop).getByRole("button", { name: "Standart yap" }));

    expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/catalog/{item_id}/adopt-actual", {
      params: { path: { item_id: "i-kal" } },
    });
    expect(await within(pop).findByText("Bu iş tipi için tamamlanmış şantiye gerçekleşeni yok")).toBeInTheDocument();
  });
});

describe("salt okunur (B1-8: full altı — KAT:392-398)", () => {
  it("draft: ekle / ↺ gizli, şerit görünür, form salt okunur açılır ve Kaydet yok", async () => {
    const user = userEvent.setup();
    permissionLevel = "draft";
    mockGets({ disciplines: [KAB], catalog: [BETON, KALIP_WITH_ACTUAL] });
    renderScreen();
    await screen.findByRole("button", { name: "Beton döküm" });

    expect(screen.queryByRole("button", { name: "+ Yeni iş tipi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerçekleşeni standart yap" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/yalnız tam yetki/);
    expect(screen.getByRole("button", { name: "Disiplinler" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Beton döküm" }));
    const dialog = screen.getByRole("dialog", { name: "İş Tipi" });
    expect(await within(dialog).findByDisplayValue("Beton döküm")).toHaveAttribute("readonly");
    expect(within(dialog).queryByRole("button", { name: "Kaydet" })).not.toBeInTheDocument();
  });

  it("full: yazma yüzeyi açık", async () => {
    renderScreen();
    expect(await screen.findByRole("button", { name: "+ Yeni iş tipi" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disiplinleri yönet" })).toBeInTheDocument();
  });
});

describe("hâller (KAT:362-401)", () => {
  it("yükleniyor: iskelet", () => {
    vi.mocked(backendClient.GET).mockReturnValue(new Promise(() => {}) as never);
    renderScreen();
    expect(screen.getByText("Katalog yükleniyor")).toBeInTheDocument();
  });

  it("hata: 'Katalog yüklenemedi' + Tekrar dene yeniden çeker", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) =>
      path === "/earned-value/catalog" ? fail(500, "patladı") : ok([KAB])) as never);
    renderScreen();

    expect(await screen.findByText("Katalog yüklenemedi")).toBeInTheDocument();
    const before = catalogGetCount();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() =>
      expect(catalogGetCount()).toBeGreaterThan(before),
    );
  });

  it("boş katalog: 'Katalog boş' + ekleme girişi (full)", async () => {
    mockGets({ disciplines: [KAB], catalog: [] });
    renderScreen();
    expect(await screen.findByText("Katalog boş")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Yeni iş tipi" })).toHaveLength(2);
  });
});
