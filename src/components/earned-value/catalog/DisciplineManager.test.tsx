import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import type { AccessLevel } from "@/lib/auth/permissions";

import { BETON, DEMIR, DUV, ELK_SITE_ONLY, INC, KAB, SIVA, fail, mockGets, ok, renderScreen } from "./catalog-test-utils";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

let permissionLevel: AccessLevel | undefined = "admin";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({
    level: permissionLevel,
    canView: true,
    canWrite: true,
    canDelete: true,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  permissionLevel = "admin";
  mockGets({ disciplines: [KAB, DUV, INC], catalog: [BETON, DEMIR, SIVA] });
});

async function openManager(label = "Disiplinleri yönet"): Promise<HTMLElement> {
  const user = userEvent.setup();
  renderScreen();
  await screen.findByRole("button", { name: "Beton döküm" });
  await user.click(screen.getByRole("button", { name: label }));
  return screen.getByRole("dialog", { name: "Disiplinler" });
}

function rowOf(dialog: HTMLElement, code: string): HTMLElement {
  const row = within(dialog).getByText(code).closest("tr");
  if (!row) throw new Error(`satır yok: ${code}`);
  return row;
}

describe("liste modalı (M6 · Disiplin Yönetimi:147-221)", () => {
  it("renk karesi VERİDEN, kod, ad, varsayılan rozet; kullanım sayıları API'den (M6:190-193)", async () => {
    const dialog = await openManager();
    const kab = within(rowOf(dialog, "KAB"));
    expect(kab.getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(kab.getByText("Kendi")).toBeInTheDocument();
    // Katalog fikstüründe KAB'a bağlı 2 kalem var; ekran API'nin 6'sını basar.
    expect(kab.getByText("6 iş tipi")).toBeInTheDocument();
    expect(kab.getByText("4 şantiye")).toBeInTheDocument();
    expect(kab.getByTestId("discipline-swatch")).toHaveStyle({ backgroundColor: "#2563eb" });
    expect(within(rowOf(dialog, "DUV")).getByText("Taşeron")).toBeInTheDocument();
    const inc = within(rowOf(dialog, "INC"));
    expect(inc.getByText("0 iş tipi")).toBeInTheDocument();
    expect(inc.getByText("0 şantiye")).toBeInTheDocument();
    expect(within(dialog).queryByText(/—\s*şantiye/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Kullanan = bu disipline bağlı iş tipi · bütçesinde BOQ grubu bu disipline eşlenmiş şantiye",
      ),
    ).toBeInTheDocument();
  });

  it("kullanımdaki disiplinde Sil PASİF ve gerekçe EKRANDA (title değil)", async () => {
    const dialog = await openManager();
    const kab = within(rowOf(dialog, "KAB"));
    const del = kab.getByRole("button", { name: "Sil" });
    expect(del).toBeDisabled();
    expect(del).not.toHaveAttribute("title");
    expect(kab.getByText("Kullanımda · silinemez")).toBeVisible();

    const inc = within(rowOf(dialog, "INC"));
    expect(inc.getByRole("button", { name: "Sil" })).toBeEnabled();
    expect(inc.queryByText("Kullanımda · silinemez")).not.toBeInTheDocument();
  });

  it("iş tipi 0 ama şantiye > 0 → yine Sil PASİF (B1-9, API sayısı)", async () => {
    mockGets({ disciplines: [KAB, INC, ELK_SITE_ONLY], catalog: [BETON] });
    const dialog = await openManager();
    const elk = within(rowOf(dialog, "ELK"));
    expect(elk.getByText("0 iş tipi")).toBeInTheDocument();
    expect(elk.getByText("2 şantiye")).toBeInTheDocument();
    expect(elk.getByRole("button", { name: "Sil" })).toBeDisabled();
    expect(elk.getByText("Kullanımda · silinemez")).toBeVisible();
  });

  it("sil kuralı katalogdan BAĞIMSIZ: katalog yüklenemese de kullanılmayan disiplin silinebilir", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) =>
      path === "/earned-value/disciplines" ? ok([KAB, INC]) : fail(500, "x")) as never);
    renderScreen();
    await screen.findByText("Katalog yüklenemedi");
    await user.click(screen.getByRole("button", { name: "Disiplinleri yönet" }));
    const dialog = screen.getByRole("dialog", { name: "Disiplinler" });
    expect(within(rowOf(dialog, "INC")).getByRole("button", { name: "Sil" })).toBeEnabled();
    expect(within(rowOf(dialog, "KAB")).getByRole("button", { name: "Sil" })).toBeDisabled();
  });

  it("full (admin değil): Düzenle var, Sil YOK (B1-9 sil = admin)", async () => {
    permissionLevel = "full";
    const dialog = await openManager();
    const inc = within(rowOf(dialog, "INC"));
    expect(inc.getByRole("button", { name: "Düzenle" })).toBeInTheDocument();
    expect(inc.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("salt okunur (draft): giriş 'Disiplinler', şerit görünür, ekle/düzenle/sil gizli", async () => {
    permissionLevel = "draft";
    const dialog = await openManager("Disiplinler");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Salt okunur · disiplin listesini yalnız tam yetki (full) değiştirir",
    );
    expect(within(dialog).queryByRole("button", { name: "+ Yeni disiplin" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Düzenle" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Değişiklik için tam yetki gerekir")).toBeInTheDocument();
  });

  it("disiplin listesi hatası: 'Disiplinler yüklenemedi'", async () => {
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) =>
      path === "/earned-value/disciplines" ? fail(500, "x") : ok([BETON])) as never);
    const dialog = await openManager();
    expect(await within(dialog).findByText("Disiplinler yüklenemedi")).toBeInTheDocument();
  });

  it("boş liste: 'Disiplin yok' + ekleme girişi", async () => {
    mockGets({ disciplines: [], catalog: [BETON] });
    const dialog = await openManager();
    expect(within(dialog).getByText("Disiplin yok")).toBeInTheDocument();
  });
});

describe("Disiplin Ekle / Düzenle formu (M6:227-304)", () => {
  it("palet 5 renkle başlar (Bütçe:523); yeni disiplinin rengi sırayla başa döner", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });

    const palette = within(form).getByRole("group", { name: "Grafik rengi" });
    const swatches = within(palette).getAllByRole("button");
    // M6:314-320 — her dairenin altında ya "sıradaki" ya da bu rengi kullanan disiplinin kodu.
    expect(swatches.map((b) => b.textContent)).toEqual([
      "#2563ebKAB",
      "#93c5fdDUV",
      "#64748b",
      "#cbd5e1sıradaki",
      "#e2e8f0INC",
    ]);
    // 3 disiplin var → 4. renk (#cbd5e1) önerilir
    expect(within(palette).getByRole("button", { name: "#cbd5e1 sıradaki" })).toHaveAttribute("aria-pressed", "true");
  });

  it("düzenlemede: kendi rengi 'sıradaki' etiketiyle işaretlenmez, BAŞKA disiplinin kullandığı renk kodla etiketlenir", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "KAB")).getByRole("button", { name: "Düzenle" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Düzenle" });

    const palette = within(form).getByRole("group", { name: "Grafik rengi" });
    // KAB'ın kendi rengi (#2563eb) düzenlemede etiketsiz kalır (kendini işaretlemez).
    expect(within(palette).getByRole("button", { name: "#2563eb" })).toBeInTheDocument();
    // DUV'un kullandığı renk (#93c5fd) "DUV" etiketiyle görünür.
    expect(within(palette).getByRole("button", { name: "#93c5fd DUV" })).toBeInTheDocument();
    // Düzenlemede "sıradaki" etiketi hiç basılmaz.
    expect(within(palette).queryByText("sıradaki")).not.toBeInTheDocument();
  });

  it("colHint oluşturmada 'sıradaki' cümlesini gösterir (M6:351)", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    expect(
      screen.getByText("Sıradaki palet rengi önceden seçildi (4. disiplin) · 6. disiplinde palet başa döner"),
    ).toBeInTheDocument();
  });

  it("colHint düzenlemede raporlar cümlesini gösterir (M6:351)", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "KAB")).getByRole("button", { name: "Düzenle" }));
    expect(screen.getByText("Panel ve raporlardaki grafiklerde bu renk kullanılır")).toBeInTheDocument();
  });

  it("düzenleme: kullanım kutusu iş tipi + şantiye sayısıyla görünür (M6:47-51)", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "KAB")).getByRole("button", { name: "Düzenle" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Düzenle" });

    expect(
      within(form).getByText(
        (_, element) => element?.tagName === "P" && element.textContent === "6 iş tipinde · 4 şantiyede kullanılıyor",
      ),
    ).toBeInTheDocument();
    expect(
      within(form).getByText(
        "Kullanımdayken de kod ve ad düzenlenebilir; bağlı iş tipleri ve geçmiş raporlar yeni adla görünür.",
      ),
    ).toBeInTheDocument();
  });

  it("oluşturma: kullanım kutusu YOK", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });
    expect(
      within(form).queryByText(
        "Kullanımdayken de kod ve ad düzenlenebilir; bağlı iş tipleri ve geçmiş raporlar yeni adla görünür.",
      ),
    ).not.toBeInTheDocument();
  });

  it("kod tekrarı ve boş ad: '2 alan hatalı', POST yok", async () => {
    const user = userEvent.setup();
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });

    await user.type(within(form).getByLabelText("Kod"), "kab");
    await user.click(within(form).getByRole("button", { name: "Kaydet" }));

    expect(within(form).getByText("2 alan eksik ya da hatalı.")).toBeInTheDocument();
    expect(within(form).getByText("Bu kod zaten var: Kaba İnşaat")).toBeInTheDocument();
    expect(within(form).getByText("Disiplin adı zorunlu")).toBeInTheDocument();
    expect(backendClient.POST).not.toHaveBeenCalled();
  });

  it("geçerli ekleme: kod büyük harfe çevrilir, gövde POST edilir, listeye dönülür + bildirim", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ ...INC, id: "d-new", code: "MEK" }, 201));
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });

    await user.type(within(form).getByLabelText("Kod"), "mek");
    await user.type(within(form).getByLabelText("Disiplin adı"), "Mekanik Tesisat");
    await user.click(within(within(form).getByRole("group", { name: "Grafik rengi" })).getByRole("button", { name: "#64748b" }));
    await user.click(within(within(form).getByRole("group", { name: "Varsayılan yapan" })).getByRole("button", { name: "Taşeron" }));
    await user.click(within(form).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/disciplines", {
        body: {
          code: "MEK",
          name: "Mekanik Tesisat",
          color: "#64748b",
          default_contractor_type: "subcon",
          sort_order: 4,
        },
      }),
    );
    const list = await screen.findByRole("dialog", { name: "Disiplinler" });
    expect(within(list).getByText("Mekanik Tesisat eklendi")).toBeInTheDocument();
  });

  it("düzenleme: KULLANIMDAKİ disiplinin kodu da değişir (F0-7); yalnız değişen alan PATCH", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...KAB, code: "KBA" }));
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "KAB")).getByRole("button", { name: "Düzenle" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Düzenle" });

    const code = await within(form).findByDisplayValue("KAB");
    expect(code).not.toHaveAttribute("readonly");
    expect(within(form).getByText("Şirkette tekil · kullanımda da düzenlenir")).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, "kba");
    await user.click(within(form).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(backendClient.PATCH).toHaveBeenCalledWith("/earned-value/disciplines/{discipline_id}", {
        params: { path: { discipline_id: "d-kab" } },
        body: { code: "KBA" },
      }),
    );
  });

  it("backend 409 (kod alınmış) formda gösterilir", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(fail(409, "Bu disiplin kodu zaten kayıtlı"));
    const dialog = await openManager();
    await user.click(within(dialog).getByRole("button", { name: "+ Yeni disiplin" }));
    const form = screen.getByRole("dialog", { name: "Disiplin Ekle" });
    await user.type(within(form).getByLabelText("Kod"), "YNI");
    await user.type(within(form).getByLabelText("Disiplin adı"), "Yeni");
    await user.click(within(form).getByRole("button", { name: "Kaydet" }));

    expect(await within(form).findByText("Bu disiplin kodu zaten kayıtlı")).toBeInTheDocument();
  });
});

describe("silme onayı (M6:307-337)", () => {
  it("kullanılmayan disiplin: onay → DELETE → listeye dönüş + bildirim", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "INC")).getByRole("button", { name: "Sil" }));

    const confirm = screen.getByRole("dialog", { name: "İnce İşler disiplini silinsin mi?" });
    expect(within(confirm).getByText("Kullanan iş tipi").nextElementSibling).toHaveTextContent("0");
    expect(within(confirm).getByText("Kullanan şantiye").nextElementSibling).toHaveTextContent("0");
    expect(within(confirm).queryByText(/—\s*şantiye/)).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Disiplini sil" }));

    await waitFor(() =>
      expect(backendClient.DELETE).toHaveBeenCalledWith("/earned-value/disciplines/{discipline_id}", {
        params: { path: { discipline_id: "d-inc" } },
      }),
    );
    const list = await screen.findByRole("dialog", { name: "Disiplinler" });
    expect(within(list).getByText("İnce İşler silindi")).toBeInTheDocument();
  });

  it("409 (bütçede eşlenmiş) → mesaj onay modalında kalır", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.DELETE).mockResolvedValue(
      fail(409, "Disiplin kullanımda (BOQ grubu eşlemesi, katalog ya da baseline); silinemez"),
    );
    const dialog = await openManager();
    await user.click(within(rowOf(dialog, "INC")).getByRole("button", { name: "Sil" }));
    const confirm = screen.getByRole("dialog", { name: "İnce İşler disiplini silinsin mi?" });
    await user.click(within(confirm).getByRole("button", { name: "Disiplini sil" }));

    expect(
      await within(confirm).findByText("Disiplin kullanımda (BOQ grubu eşlemesi, katalog ya da baseline); silinemez"),
    ).toBeInTheDocument();
  });
});
