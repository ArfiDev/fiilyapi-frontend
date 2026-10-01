import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import { BETON, DEMIR, D_DUV, D_KAB, SIVA } from "./work-item-fixtures";
import { fail, getCalls, mockGets, mockItemsFailure, ok, renderScreen } from "./work-item-test-utils";

const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: perm.level, canView: perm.level !== "none", canWrite: true, canDelete: true }),
}));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const STRIP_VIEW = "Görüntüleyici · yalnız okuma";
const STRIP_BELOW_FULL = "Salt okunur · kataloğu yalnız Sözleşmeler tam yetkisi değiştirir";
const STRIP_RESTRICTED = "Salt okunur · disiplin kısıtlı kullanıcı kataloğu değiştiremez";

beforeEach(() => {
  vi.clearAllMocks();
  perm.level = "full";
  scope.value = { isRestricted: false, names: [] };
  mockGets({ disciplines: [D_KAB, D_DUV], items: [BETON, DEMIR, SIVA] });
});

afterEach(() => {
  vi.useRealTimers();
});

function postBody(): Record<string, unknown> {
  const call = vi.mocked(backendClient.POST).mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
  return call[1].body;
}

describe("erişim (T25: contracts:view okur, full + kısıtsız yazar)", () => {
  it("contracts:none → AccessDenied ve katalog ucu HİÇ çağrılmaz", async () => {
    perm.level = "none";
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(getCalls()).toEqual([]);
  });

  it("uç 403 dönerse (seviye bilinmiyorken) AccessDenied", async () => {
    perm.level = undefined;
    mockItemsFailure(403, "Yetkisiz işlem", [D_KAB]);
    renderScreen();
    expect(await screen.findByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Kalem Ekle" })).not.toBeInTheDocument();
  });

  it("view → yazma yok ('+ Kalem Ekle'/'Düzenle'), şerit ÜS-10 metni", async () => {
    perm.level = "view";
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByRole("button", { name: "+ Kalem Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.getByText(STRIP_VIEW)).toBeInTheDocument();
  });

  it("draft (canWrite=true olsa bile) → yazma yok: yazma eşiği 'full'dur", async () => {
    perm.level = "draft";
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByRole("button", { name: "+ Kalem Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.getByText(STRIP_BELOW_FULL)).toBeInTheDocument();
  });

  it("full ama disiplin kısıtlı → salt okunur + kısıtlı metni", async () => {
    scope.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByRole("button", { name: "+ Kalem Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.getByText(STRIP_RESTRICTED)).toBeInTheDocument();
  });

  it("full + kısıtsız → yazma yüzeyi var, şerit yok", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /düzenle/i })).toHaveLength(3);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("liste (KIK:128-147)", () => {
  it("başlık, alt metin ve 9 kolon; poz no başlığında yıldız YOK (ÜS-3)", async () => {
    renderScreen();
    expect(await screen.findByRole("heading", { level: 1, name: "İş Kalemi Kataloğu" })).toBeInTheDocument();
    expect(
      screen.getByText("Şirket geneli poz listesi · teklif, sözleşme ve adam-saat bütçesi buradan kalem çeker"),
    ).toBeInTheDocument();
    const headers = (await screen.findAllByRole("columnheader")).map((h) => h.textContent);
    expect(headers).toEqual([
      "Poz No",
      "Tarif",
      "Birim",
      "Referans fiyat ₺",
      "Son fiyat",
      "A-s / birim",
      "Vars. yüklenici",
      "Fiyat güncelleme",
      "",
    ]);
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("satır poz no sırasıyla: DUV-0001, KAB-0001, KAB-0002; hücre değerleri tr-TR", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    const pozCells = screen.getAllByTestId("wik-poz").map((c) => c.textContent);
    expect(pozCells).toEqual(["DUV-0001", "KAB-0001", "KAB-0002"]);
    const row = within(screen.getByTestId("wik-row-i-bet"));
    expect(row.getByText("KAB · Kaba İnşaat")).toBeInTheDocument();
    expect(row.getByText("m³")).toBeInTheDocument();
    expect(row.getByText("1.250,50")).toBeInTheDocument();
    expect(row.getByText("1,80")).toBeInTheDocument();
    expect(row.getByText("Kendi")).toBeInTheDocument();
    expect(row.getByText("01.09.2026")).toBeInTheDocument();
    // ÜS-8: son fiyat kaynağı henüz yok
    expect(row.getByText("henüz kaynak yok")).toBeInTheDocument();
    // fiyatsız kalem → —
    expect(within(screen.getByTestId("wik-row-i-siv")).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("182 günden eski fiyat tarihi turuncu (KIK:240); yenisi değil", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T12:00:00Z") });
    renderScreen();
    await vi.waitFor(() => expect(screen.getByText("Demir bağlama")).toBeInTheDocument());
    expect(within(screen.getByTestId("wik-row-i-dem")).getByText("02.01.2026")).toHaveClass("wik-upd--stale");
    expect(within(screen.getByTestId("wik-row-i-bet")).getByText("01.09.2026")).not.toHaveClass("wik-upd--stale");
  });

  it("mockup'tan KALKANLAR basılmaz: eksik poz bandı, 'poz yok' rozeti, eksik çipi", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.queryByText(/poz yok/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yalnız poz no'su olmayanlar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Eksikleri göster/)).not.toBeInTheDocument();
  });

  it("dipnot ÜS-8: referans fiyat elle girilir + turuncu tarih; son-fiyat kaynağı ve '+%' maddeleri YOK", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByText("Referans fiyat elle girilir")).toBeInTheDocument();
    expect(screen.getByText("6 aydan eski fiyat")).toBeInTheDocument();
    expect(screen.queryByText(/satınalma, hakediş ve kazanılan tekliflerden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/referansın %5 üstünde/)).not.toBeInTheDocument();
  });
});

describe("sekmeler, Excel, çipler, arama (KIK:72-125)", () => {
  it("yalnız İş Kalemleri etkin; diğer üçü devre-dışı 'Yakında' + title; sayaçlar ÜS-9", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    const active = screen.getByRole("button", { name: /^İş Kalemleri/ });
    expect(active).toBeEnabled();
    expect(active).toHaveTextContent("3");
    for (const name of [/^Disiplinler/, /^Birimler/, /^İçe aktarım geçmişi/]) {
      const tab = screen.getByRole("button", { name });
      expect(tab).toBeDisabled();
      expect(tab).toHaveTextContent("Yakında");
      expect(tab).toHaveAttribute("title");
    }
    expect(screen.getByRole("button", { name: /^Disiplinler/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /^Birimler/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /^İçe aktarım geçmişi/ })).not.toHaveTextContent(/\d/);
  });

  it("Excel düğmeleri devre-dışı (title ile)", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    for (const name of ["Excel İndir", "Excel'den İçe Aktar"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title");
    }
  });

  it("disiplin çipleri sayaçla gelir; seçilince süzer ve '2 kalem' sayısı güncellenir", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", { name: /Tüm disiplinler/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Kaba İnşaat/ })).toHaveTextContent("2");
    expect(screen.getByTestId("wik-count")).toHaveTextContent("3 kalem");

    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    expect(screen.getByRole("button", { name: /Duvar & Sıva/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Beton döküm")).not.toBeInTheDocument();
    expect(screen.getByText("İç sıva")).toBeInTheDocument();
    expect(screen.getByTestId("wik-count")).toHaveTextContent("1 kalem");
  });

  it("arama poz no ya da tarifle süzer (tr-TR); eşleşme yoksa 'Filtreye uyan kalem yok.'", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    const search = screen.getByPlaceholderText("Poz no ya da tarif ara");

    await user.type(search, "duv-0");
    expect(screen.queryByText("Beton döküm")).not.toBeInTheDocument();
    expect(screen.getByText("İç sıva")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "İÇ");
    expect(screen.getByText("İç sıva")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("Filtreye uyan kalem yok.")).toBeInTheDocument();
  });
});

describe("boş katalog (ÜS-15) ve kısıtlı boş liste", () => {
  it("tamamen boş → 'Katalog boş' + açıklama + '+ Kalem Ekle'", async () => {
    mockGets({ disciplines: [D_KAB], items: [] });
    renderScreen();
    expect(await screen.findByText("Katalog boş")).toBeInTheDocument();
    expect(screen.getByText("İlk iş kalemlerinizi ekleyin; teklif ve sözleşme buradan kalem çeker.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Kalem Ekle" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Filtreye uyan kalem yok.")).not.toBeInTheDocument();
  });

  it("view rolünde boş katalog: ekleme girişi yok", async () => {
    perm.level = "view";
    mockGets({ disciplines: [D_KAB], items: [] });
    renderScreen();
    expect(await screen.findByText("Katalog boş")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Kalem Ekle" })).not.toBeInTheDocument();
  });

  it("kısıtlı + boş → RestrictedEmptyNotice, 'Katalog boş' değil", async () => {
    scope.value = { isRestricted: true, names: ["Kaba İnşaat"] };
    mockGets({ disciplines: [D_KAB], items: [] });
    renderScreen();
    expect(await screen.findByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Katalog boş")).not.toBeInTheDocument();
  });
});

describe("yeni kalem (satır içi)", () => {
  async function openNewRow(user: ReturnType<typeof userEvent.setup>) {
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    return within(screen.getByTestId("wik-edit-new-1"));
  }

  it("poz hücresi soluk 'Otomatik' (ÜS-1), ipucu ÜS-2 metni; poz girişi YOK", async () => {
    const user = userEvent.setup();
    const row = await openNewRow(user);
    expect(row.getByText("Otomatik")).toBeInTheDocument();
    expect(
      row.getByText("Poz no otomatik verilir · disiplin kodu + sıra (MIM-0001) · şirket genelinde tekil"),
    ).toBeInTheDocument();
    expect(row.queryByPlaceholderText("00.000")).not.toBeInTheDocument();
    expect(row.getByText("kayıtta güncellenir")).toBeInTheDocument();
    expect(row.getByText("salt okunur · henüz kaynak yok")).toBeInTheDocument();
  });

  it("disiplin: aktif çip yoksa İLK disiplin; alt satırda 'KOD · Ad' (ÜS-4); yüklenici disiplin varsayılanı", async () => {
    const user = userEvent.setup();
    const row = await openNewRow(user);
    expect(row.getByText("KAB · Kaba İnşaat")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Kendi", pressed: true })).toBeInTheDocument();
  });

  it("aktif çip DUV iken yeni kalem DUV'a açılır, yüklenici Taş. (disiplin varsayılanı)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    const row = within(screen.getByTestId("wik-edit-new-1"));
    expect(row.getByText("DUV · Duvar & Sıva")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Taş.", pressed: true })).toBeInTheDocument();
  });

  it("boş Kaydet → mockup sırasıyla tek hata satırı, istek YOK", async () => {
    const user = userEvent.setup();
    const row = await openNewRow(user);
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(row.getByText("Tarif zorunlu")).toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
    await user.type(row.getByLabelText("Tarif"), "Kolon kalıbı");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(row.getByText("Referans fiyat girin")).toBeInTheDocument();
    expect(row.queryByText("Tarif zorunlu")).not.toBeInTheDocument();
    await user.type(row.getByLabelText("Referans fiyat"), "650,00");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(row.getByText("A-s zorunlu · 0'dan büyük olmalı")).toBeInTheDocument();
  });

  it("geçerli Kaydet → POST gövdesi poz_no'suz, ondalık kayıpsız; toast sunucunun poz no'suyla (role=status)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(
      ok({ ...BETON, id: "i-new", poz_no: "KAB-0003", name: "Kolon kalıbı", uom: "m²" }, 201),
    );
    const row = await openNewRow(user);
    await user.type(row.getByLabelText("Tarif"), "  Kolon kalıbı ");
    await user.selectOptions(row.getByLabelText("Birim"), "m²");
    await user.type(row.getByLabelText("Referans fiyat"), "650,05");
    await user.type(row.getByLabelText("A-s / birim"), "1,0512");
    await user.click(row.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("KAB-0003 · Kolon kalıbı kaydedildi"));
    expect(postBody()).toEqual({
      discipline_id: "d-kab",
      name: "Kolon kalıbı",
      uom: "m²",
      ref_price: "650.05",
      standard_unit_mhr: "1.0512",
      default_contractor_type: "own",
    });
    expect(Object.keys(postBody())).not.toContain("poz_no");
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
  });

  it("409 → backend metni satırın hata yuvasında, satır AÇIK kalır, toast yok", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, "Bu disiplinde aynı ad ve birimle bir iş kalemi zaten var"),
    );
    const row = await openNewRow(user);
    await user.type(row.getByLabelText("Tarif"), "Beton döküm");
    await user.type(row.getByLabelText("Referans fiyat"), "1");
    await user.type(row.getByLabelText("A-s / birim"), "1");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(await row.findByText("Bu disiplinde aynı ad ve birimle bir iş kalemi zaten var")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("wik-edit-new-1")).toBeInTheDocument();
  });

  it("Vazgeç satırı kaldırır, istek yok", async () => {
    const user = userEvent.setup();
    const row = await openNewRow(user);
    await user.click(row.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
    expect(vi.mocked(backendClient.POST)).not.toHaveBeenCalled();
  });

  it("yazılan tarif kaydedilmemiş değişiklik olarak kayda geçer; Vazgeç siler (useUnsavedChanges)", async () => {
    const user = userEvent.setup();
    const row = await openNewRow(user);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await user.type(row.getByLabelText("Tarif"), "x");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    expect(unsavedRegistry.labels()).toContain("İş kalemi");
    await user.click(row.getByRole("button", { name: "Vazgeç" }));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("düzenleme (satır içi)", () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    return within(screen.getByTestId("wik-edit-i-bet"));
  }

  it("poz no salt okunur metin (girdi değil); disiplin alt satırı; mevcut değerler dolu; ipucu ÜS-2", async () => {
    const user = userEvent.setup();
    const row = await openEdit(user);
    expect(row.getByTestId("wik-poz")).toHaveTextContent("KAB-0001");
    expect(row.queryByRole("textbox", { name: /poz/i })).not.toBeInTheDocument();
    expect(row.getByText("KAB · Kaba İnşaat")).toBeInTheDocument();
    expect(row.getByLabelText("Tarif")).toHaveValue("Beton döküm");
    expect(row.getByLabelText("Referans fiyat")).toHaveValue("1250,50");
    expect(row.getByLabelText("A-s / birim")).toHaveValue("1,80");
    expect(row.getByLabelText("Birim")).toHaveValue("m³");
    expect(
      row.getByText("Poz no otomatik verilir · disiplin kodu + sıra (MIM-0001) · şirket genelinde tekil"),
    ).toBeInTheDocument();
  });

  it("yalnız fiyat değişince PATCH gövdesi yalnız ref_price; poz_no ve discipline_id yok; toast", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...BETON, ref_price: "1300.00" }));
    const row = await openEdit(user);
    const price = row.getByLabelText("Referans fiyat");
    await user.clear(price);
    await user.type(price, "1300,00");
    await user.click(row.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("KAB-0001 · Beton döküm kaydedildi"));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/catalog/items/{item_id}", {
      params: { path: { item_id: "i-bet" } },
      body: { ref_price: "1300.00" },
    });
    expect(screen.queryByTestId("wik-edit-i-bet")).not.toBeInTheDocument();
  });

  it("fiyatsız kalem: fiyat boş bırakılırsa 'Referans fiyat girin' (ÜS-6), istek yok", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("İç sıva");
    await user.click(screen.getByRole("button", { name: /DUV-0001.*düzenle/i }));
    const row = within(screen.getByTestId("wik-edit-i-siv"));
    expect(row.getByLabelText("Referans fiyat")).toHaveValue("");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(row.getByText("Referans fiyat girin")).toBeInTheDocument();
    expect(vi.mocked(backendClient.PATCH)).not.toHaveBeenCalled();
  });

  it("değişiklik yokken Kaydet istek atmaz ve satırı kapatır", async () => {
    const user = userEvent.setup();
    const row = await openEdit(user);
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(vi.mocked(backendClient.PATCH)).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wik-edit-i-bet")).not.toBeInTheDocument();
  });

  it("404/403 gibi hatalar backend metniyle satırda", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(fail(403, "Bu işlem için yetkiniz yok"));
    const row = await openEdit(user);
    await user.clear(row.getByLabelText("Tarif"));
    await user.type(row.getByLabelText("Tarif"), "Beton");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(await row.findByText("Bu işlem için yetkiniz yok")).toBeInTheDocument();
    expect(screen.getByTestId("wik-edit-i-bet")).toBeInTheDocument();
  });
});
