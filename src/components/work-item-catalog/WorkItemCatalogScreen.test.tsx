import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

import {
  BETON,
  DEMIR,
  D_DUV,
  D_KAB,
  KAT_BOTH,
  KAT_DATE_ONLY,
  LAST_EMPTY,
  LAST_HK_HIGH,
  LAST_MASKED,
  LAST_SZL,
  LAST_UNKNOWN_SOURCE,
  SIVA,
} from "./work-item-fixtures";
import { LAST_PRICE_HIGH_PCT } from "./last-price";
import { fail, getCalls, mockGets, mockItemsFailure, ok, renderScreen, type ApiState } from "./work-item-test-utils";

const perm = vi.hoisted(() => ({ level: "full" as string | undefined }));
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));

const downloadCatalogExport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/catalog-export-client", () => ({ downloadCatalogExport }));
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
  downloadCatalogExport.mockResolvedValue("Is-Kalemi-Katalogu.xlsx");
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

  it("dipnot ÜS-F2-17 + TKL-F3.8: son fiyat kaynakları sözleşme, onaylı hakediş ve kazanılan teklifler; SA vaadi YOK", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(
      screen.getByText(/son fiyat işveren sözleşmeleri, onaylı hakedişler ve kazanılan tekliflerden gelir/),
    ).toBeInTheDocument();
    expect(screen.getByText("6 aydan eski fiyat")).toBeInTheDocument();
    expect(screen.queryByText(/satınalma/i)).not.toBeInTheDocument();
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

  it("'Excel İndir' etkin; 'Excel'den İçe Aktar' 'Yakında' kalır (devre-dışı + title)", async () => {
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", { name: "Excel İndir" })).toBeEnabled();
    const importButton = screen.getByRole("button", { name: "Excel'den İçe Aktar" });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute("title");
  });

  it("Excel İndir: 'Tüm disiplinler'de süzgeçsiz; çip seçiliyse o disiplinle; arama metni ASLA gitmez (ÜS-F4-14)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "Excel İndir" }));
    expect(downloadCatalogExport).toHaveBeenLastCalledWith({ disciplineId: null });
    expect(await screen.findByText("Excel indiriliyor · Is-Kalemi-Katalogu.xlsx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    await user.type(screen.getByPlaceholderText("Poz no ya da tarif ara"), "siva");
    await user.click(screen.getByRole("button", { name: "Excel İndir" }));
    expect(downloadCatalogExport).toHaveBeenLastCalledWith({ disciplineId: "d-duv" });
  });

  it("Excel İndir hatası BackendError metniyle görünür", async () => {
    const user = userEvent.setup();
    downloadCatalogExport.mockRejectedValue(new BackendError(403, { detail: "Excel için yetkiniz yok" }));
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "Excel İndir" }));
    expect(await screen.findByText("Excel için yetkiniz yok")).toBeInTheDocument();
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

/** Çözülmesi testin elinde bir söz (yarım kalmış istek). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("F1.3.1-1 · taslaklar EKRAN düzeyindedir (süzgeç satırı düşürse de taslak yaşar)", () => {
  it("Düzenle → Tarif değiştir → DUV çipi → Tüm disiplinler → satır AÇIK, Tarif değişmiş, kirli kayıt var", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const tarif = within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif");
    await user.clear(tarif);
    await user.type(tarif, "Beton döküm C35");

    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    expect(screen.queryByTestId("wik-edit-i-bet")).not.toBeInTheDocument();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.click(screen.getByRole("button", { name: /Tüm disiplinler/ }));
    const reopened = within(screen.getByTestId("wik-edit-i-bet"));
    expect(reopened.getByLabelText("Tarif")).toHaveValue("Beton döküm C35");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("arama satırı düşürürken de aynı: taslak ve kirli kayıt korunur", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const tarif = within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif");
    await user.type(tarif, "x");
    await user.type(screen.getByPlaceholderText("Poz no ya da tarif ara"), "duv");
    expect(screen.queryByTestId("wik-edit-i-bet")).not.toBeInTheDocument();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.clear(screen.getByPlaceholderText("Poz no ya da tarif ara"));
    expect(within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif")).toHaveValue("Beton dökümx");
  });

  it("yeni satır taslağı da çip değişince silinmez (KAB'a açıldı → DUV çipi → Tüm)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    await user.type(within(screen.getByTestId("wik-edit-new-1")).getByLabelText("Tarif"), "Kolon");
    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await user.click(screen.getByRole("button", { name: /Tüm disiplinler/ }));
    expect(within(screen.getByTestId("wik-edit-new-1")).getByLabelText("Tarif")).toHaveValue("Kolon");
  });

  it("kayıt sürerken süzgeç değişirse 409 metni KAYBOLMAZ", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    vi.mocked(backendClient.PATCH).mockReturnValue(pending.promise as never);
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const tarif = within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif");
    await user.type(tarif, "x");
    await user.click(within(screen.getByTestId("wik-edit-i-bet")).getByRole("button", { name: "Kaydet" }));
    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));

    await act(async () => {
      pending.resolve(fail(409, "Bu disiplinde aynı ad ve birimle bir iş kalemi zaten var"));
    });
    await user.click(screen.getByRole("button", { name: /Tüm disiplinler/ }));
    const row = within(screen.getByTestId("wik-edit-i-bet"));
    expect(row.getByText("Bu disiplinde aynı ad ve birimle bir iş kalemi zaten var")).toBeInTheDocument();
    expect(row.getByLabelText("Tarif")).toHaveValue("Beton dökümx");
    expect(row.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });

  it("kayıt süren satırda Kaydet/Vazgeç pasiftir", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    vi.mocked(backendClient.PATCH).mockReturnValue(pending.promise as never);
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const row = within(screen.getByTestId("wik-edit-i-bet"));
    await user.type(row.getByLabelText("Tarif"), "x");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    expect(row.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    expect(row.getByRole("button", { name: "Vazgeç" })).toBeDisabled();
    await act(async () => {
      pending.resolve(ok({ ...BETON, name: "Beton dökümx" }));
    });
  });
});

describe("F1.3.1-3 · arka plan tazelemesi hatası veri varken tabloyu SİLMEZ", () => {
  it("satır açıkken GET 500 → satır + taslak durur, tablonun üstünde onaylı metin + Tekrar dene (role=alert YOK)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...DEMIR, name: "Demir bağlama 2" }));
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    await user.type(within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif"), "x");
    await user.click(screen.getByRole("button", { name: /KAB-0002.*düzenle/i }));
    const demir = within(screen.getByTestId("wik-edit-i-dem"));
    await user.type(demir.getByLabelText("Tarif"), " 2");

    asGet().mockImplementation((async (path: string) => {
      if (path === "/catalog/disciplines") return ok({ items: [D_KAB, D_DUV] });
      return fail(500, "Sunucu hatası");
    }) as never);
    await user.click(demir.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByText("Katalog yüklenemedi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("wik-edit-i-bet")).getByLabelText("Tarif")).toHaveValue("Beton dökümx");
    expect(screen.getByRole("table", { name: "İş kalemleri" })).toBeInTheDocument();
  });

  it("Tekrar dene her iki sorguyu yeniden çeker ve band kalkar", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...DEMIR }));
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: /KAB-0002.*düzenle/i }));
    asGet().mockImplementation((async () => fail(500, "Sunucu hatası")) as never);
    await user.type(within(screen.getByTestId("wik-edit-i-dem")).getByLabelText("Tarif"), "!");
    await user.click(within(screen.getByTestId("wik-edit-i-dem")).getByRole("button", { name: "Kaydet" }));
    await screen.findByText("Katalog yüklenemedi");

    mockGets({ disciplines: [D_KAB, D_DUV], items: [BETON, DEMIR, SIVA] });
    const before = getCalls().length;
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(screen.queryByText("Katalog yüklenemedi")).not.toBeInTheDocument());
    expect(getCalls().slice(before).sort()).toEqual(["/catalog/disciplines", "/catalog/items"]);
  });

  it("veri HİÇ yokken tam kutu (eski davranış) korunur", async () => {
    mockItemsFailure(500, "Sunucu hatası", [D_KAB]);
    renderScreen();
    expect(await screen.findByText("Katalog yüklenemedi")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "İş kalemleri" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Katalog yüklenemedi")).toHaveLength(1);
  });
});

function asGet() {
  return vi.mocked(backendClient.GET);
}

describe("F1.3.1-4 · disiplinler yüklenmeden '+ Kalem Ekle' pasif; disiplin hatası bandı", () => {
  it("disiplinler bekliyor → buton pasif; gelince etkin ve satır disiplinli", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    asGet().mockImplementation((async (path: string) => {
      if (path === "/catalog/disciplines") return pending.promise;
      return ok({ items: [BETON, DEMIR, SIVA] });
    }) as never);
    renderScreen();
    await screen.findByText("Beton döküm");
    expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeDisabled();

    await act(async () => {
      pending.resolve(ok({ items: [D_KAB, D_DUV] }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    const row = within(screen.getByTestId("wik-edit-new-1"));
    expect(row.getByText("KAB · Kaba İnşaat")).toBeInTheDocument();
    await user.type(row.getByLabelText("Tarif"), "x");
    await user.type(row.getByLabelText("Referans fiyat"), "1");
    await user.type(row.getByLabelText("A-s / birim"), "1");
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ ...BETON, id: "i-n", poz_no: "KAB-0003" }, 201));
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(backendClient.POST).toHaveBeenCalled());
    expect(postBody().discipline_id).toBe("d-kab");
    expect(screen.queryByText("Önce disiplin ekleyin")).not.toBeInTheDocument();
  });

  it("boş katalogdaki '+ Kalem Ekle' de disiplin yüklenene dek pasif", async () => {
    asGet().mockImplementation((async (path: string) => {
      if (path === "/catalog/disciplines") return new Promise(() => undefined);
      return ok({ items: [] });
    }) as never);
    renderScreen();
    await screen.findByText("Katalog boş");
    for (const button of screen.getAllByRole("button", { name: "+ Kalem Ekle" })) expect(button).toBeDisabled();
  });

  it("disiplin isteği hata verirse band (aynı onaylı metin) + Tekrar dene; buton pasif; kalem tablosu durur", async () => {
    const user = userEvent.setup();
    asGet().mockImplementation((async (path: string) => {
      if (path === "/catalog/disciplines") return fail(500, "Sunucu hatası");
      return ok({ items: [BETON, DEMIR, SIVA] });
    }) as never);
    renderScreen();
    expect(await screen.findByText("Katalog yüklenemedi")).toBeInTheDocument();
    expect(screen.getByText("Beton döküm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    mockGets({ disciplines: [D_KAB, D_DUV], items: [BETON, DEMIR, SIVA] });
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Kalem Ekle" })).toBeEnabled());
    expect(screen.queryByText("Katalog yüklenemedi")).not.toBeInTheDocument();
  });
});

describe("F1.3.1-12 · yeni satır listenin PARÇASIDIR (KIK:244, :277-279)", () => {
  it("sayaçlar yeni satırı sayar: 'N kalem', çip, 'Tüm', sekme", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    expect(screen.getByTestId("wik-count")).toHaveTextContent("4 kalem");
    expect(screen.getByRole("button", { name: /Tüm disiplinler/ })).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /Kaba İnşaat/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Duvar & Sıva/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^İş Kalemleri/ })).toHaveTextContent("4");
    await user.click(within(screen.getByTestId("wik-edit-new-1")).getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByTestId("wik-count")).toHaveTextContent("3 kalem");
    expect(screen.getByRole("button", { name: /^İş Kalemleri/ })).toHaveTextContent("3");
  });

  it("çip süzgeci yeni satıra da uygulanır: KAB'a açılan satır DUV çipinde görünmez, 1 kalem", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    await user.click(screen.getByRole("button", { name: /Duvar & Sıva/ }));
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("wik-count")).toHaveTextContent("1 kalem");
    await user.click(screen.getByRole("button", { name: /Kaba İnşaat/ }));
    expect(screen.getByTestId("wik-edit-new-1")).toBeInTheDocument();
    expect(screen.getByTestId("wik-count")).toHaveTextContent("3 kalem");
  });

  it("arama yeni satırın yazılan tarifine uygulanır (boş tarif eşleşmez); '+ Kalem Ekle' aramayı temizler", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Beton döküm");
    const search = screen.getByPlaceholderText("Poz no ya da tarif ara");
    await user.type(search, "duv");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    expect(search).toHaveValue("");
    await user.type(within(screen.getByTestId("wik-edit-new-1")).getByLabelText("Tarif"), "Kolon kalıbı");
    await user.type(search, "kolon");
    expect(screen.getByTestId("wik-edit-new-1")).toBeInTheDocument();
    expect(screen.getByTestId("wik-count")).toHaveTextContent("1 kalem");
    await user.clear(search);
    await user.type(search, "beton");
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
  });

  it("kayıt sonrası sayaç çifte saymaz (taslak düşer, sunucu satırı gelir)", async () => {
    const user = userEvent.setup();
    const state: ApiState = { disciplines: [D_KAB, D_DUV], items: [BETON, DEMIR, SIVA] };
    mockGets(state);
    vi.mocked(backendClient.POST).mockImplementation((async () => {
      const created = { ...BETON, id: "i-new", poz_no: "KAB-0003", name: "Kolon kalıbı" };
      state.items = [...state.items, created];
      return ok(created, 201);
    }) as never);
    renderScreen();
    await screen.findByText("Beton döküm");
    await user.click(screen.getByRole("button", { name: "+ Kalem Ekle" }));
    const row = within(screen.getByTestId("wik-edit-new-1"));
    await user.type(row.getByLabelText("Tarif"), "Kolon kalıbı");
    await user.type(row.getByLabelText("Referans fiyat"), "650,00");
    await user.type(row.getByLabelText("A-s / birim"), "1");
    await user.click(row.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByTestId("wik-count")).toHaveTextContent("4 kalem"));
    expect(screen.getByRole("button", { name: /^İş Kalemleri/ })).toHaveTextContent("4");
    expect(screen.queryByTestId("wik-edit-new-1")).not.toBeInTheDocument();
  });
});

describe("F1.3.1-13 · aynı bildirim iki kez gelirse 2800 ms sayacı sıfırlanır (KIK:237)", () => {
  it("ikinci aynı toast, ilkinin zamanlayıcısıyla erken kapanmaz", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...BETON }));
    renderScreen();
    await screen.findByText("Beton döküm");

    const saveOnce = async () => {
      await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
      const row = within(screen.getByTestId("wik-edit-i-bet"));
      await user.clear(row.getByLabelText("Tarif"));
      await user.type(row.getByLabelText("Tarif"), "Beton");
      await user.click(row.getByRole("button", { name: "Kaydet" }));
      await screen.findByRole("status");
    };
    await saveOnce();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await saveOnce();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("status")).toHaveTextContent("KAB-0001 · Beton döküm kaydedildi");
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("Son fiyat kolonu (TKL-F2.5 · KIK:138-141, 252-256)", () => {
  beforeEach(() => {
    mockGets({
      disciplines: [D_KAB, D_DUV],
      items: [LAST_SZL, LAST_HK_HIGH, LAST_EMPTY, LAST_MASKED, LAST_UNKNOWN_SOURCE],
    });
  });

  it("dolu SZL: ₺ fiyat + soluk fark + 'Sözleşme · GNK · 12.09'", async () => {
    renderScreen();
    const row = within(await screen.findByTestId("wik-row-i-szl"));
    expect(row.getByText("₺3.410,00")).toBeInTheDocument();
    const diff = row.getByText("+%1,8");
    expect(diff).not.toHaveClass("wik-last__diff--high");
    expect(row.getByText("Sözleşme · GNK · 12.09")).toBeInTheDocument();
    expect(row.queryByText("henüz kaynak yok")).not.toBeInTheDocument();
  });

  it("dolu HK > %5: fark kırmızı sınıfta; tarih İstanbul günü (UTC 21:30 → 21.09)", async () => {
    renderScreen();
    const row = within(await screen.findByTestId("wik-row-i-hk"));
    expect(row.getByText("₺555,00")).toBeInTheDocument();
    expect(row.getByText("+%6,7")).toHaveClass("wik-last__diff--high");
    expect(row.getByText("Hakediş · HK-GNK-8 · 21.09")).toBeInTheDocument();
  });

  it("boş (ref var, kaynak yok): '—' + 'henüz kaynak yok'", async () => {
    renderScreen();
    const row = within(await screen.findByTestId("wik-row-i-bos"));
    expect(row.getByText("henüz kaynak yok")).toBeInTheDocument();
  });

  it("ÇİFT-NULL (limited maskesi): yalnız '—', 'henüz kaynak yok' YOK (ÜS-F2-15)", async () => {
    renderScreen();
    const row = within(await screen.findByTestId("wik-row-i-msk"));
    expect(row.queryByText("henüz kaynak yok")).not.toBeInTheDocument();
    expect(row.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("bilinmeyen kaynak ham; negatif fark eksi işaretli; uzun kod kırpılır ama title tam metin taşır", async () => {
    renderScreen();
    const row = within(await screen.findByTestId("wik-row-i-unk"));
    expect(row.getByText("\u2212%3,2")).not.toHaveClass("wik-last__diff--high");
    const source = row.getByText("ZZ · COK-UZUN-PROJE-KODU-2026-A-BLOK · 05.03");
    expect(source).toHaveAttribute("title", "ZZ · COK-UZUN-PROJE-KODU-2026-A-BLOK · 05.03");
  });

  it("düzenleme satırı: aynı değer salt okunur kaynak satırıyla (KIK:158)", async () => {
    const user = userEvent.setup();
    renderScreen();
    const view = within(await screen.findByTestId("wik-row-i-szl"));
    await user.click(view.getByRole("button", { name: /düzenle/ }));
    const row = within(screen.getByTestId("wik-edit-i-szl"));
    expect(row.getByText("₺3.410,00")).toBeInTheDocument();
    expect(row.getByText("salt okunur · Sözleşme · GNK · 12.09")).toBeInTheDocument();
  });

  it("düzenleme satırı maskeli kalemde 'henüz kaynak yok' basmaz", async () => {
    const user = userEvent.setup();
    renderScreen();
    const view = within(await screen.findByTestId("wik-row-i-msk"));
    await user.click(view.getByRole("button", { name: /düzenle/ }));
    const row = within(screen.getByTestId("wik-edit-i-msk"));
    expect(row.queryByText(/henüz kaynak yok/)).not.toBeInTheDocument();
  });

  it("dipnot (KIK:184-188 · ÜS-F2-17): üç madde, eşik metni sabitten", async () => {
    renderScreen();
    await screen.findByTestId("wik-row-i-szl");
    expect(
      screen.getByText(
        "Referans fiyat elle girilir; son fiyat işveren sözleşmeleri, onaylı hakedişler ve kazanılan tekliflerden gelir",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("+%")).toBeInTheDocument();
    expect(screen.getByText(`son fiyat referansın %${LAST_PRICE_HIGH_PCT} üstünde`)).toBeInTheDocument();
    expect(screen.getByText("turuncu tarih")).toBeInTheDocument();
    expect(screen.getByText("6 aydan eski fiyat")).toBeInTheDocument();
  });
});

describe("KAT-F1.1 · Bakanlık no + fiyat tarihi alt satırları (T45/T47)", () => {
  const failBody = (status: number, error: unknown) =>
    ({ data: undefined, error, response: new Response(null, { status }) }) as never;

  async function renderThree() {
    mockGets({ disciplines: [D_KAB, D_DUV], items: [BETON, KAT_BOTH, KAT_DATE_ONLY] });
    renderScreen();
    await screen.findByText("Bakanlık kalemi");
  }
  const rowOf = (id: string) => within(screen.getByTestId(`wik-row-${id}`));

  it("ikisi dolu: Bakanlık no poz no hücresinde, 'Bakanlık · 01.01.2026' referans fiyat hücresinde", async () => {
    await renderThree();
    const row = rowOf("i-kb");
    expect(row.getByTestId("wik-source-code")).toHaveTextContent("15.100.1001");
    expect(row.getByTestId("wik-ref-date")).toHaveTextContent(/^Bakanlık · 01\.01\.2026$/);
  });

  it("yalnız tarih: kod satırı YOK, tarih satırı yalnız '01.01.2026'", async () => {
    await renderThree();
    const row = rowOf("i-kd");
    expect(row.queryByTestId("wik-source-code")).not.toBeInTheDocument();
    expect(row.getByTestId("wik-ref-date")).toHaveTextContent(/^01\.01\.2026$/);
  });

  it("ikisi de null: hiçbir alt satır basılmaz", async () => {
    await renderThree();
    const row = rowOf("i-bet");
    expect(row.queryByTestId("wik-source-code")).not.toBeInTheDocument();
    expect(row.queryByTestId("wik-ref-date")).not.toBeInTheDocument();
  });

  it("arama Bakanlık no'da da bulur ('15.100' → yalnız o kalem)", async () => {
    const user = userEvent.setup();
    await renderThree();
    await user.type(screen.getByPlaceholderText("Poz no ya da tarif ara"), "15.100");
    expect(screen.getByText("Bakanlık kalemi")).toBeInTheDocument();
    expect(screen.queryByText("Beton döküm")).not.toBeInTheDocument();
    expect(screen.queryByText("Yalnız tarihli kalem")).not.toBeInTheDocument();
  });

  it("düzenleme satırı Bakanlık no + tarihi SALT OKUMA gösterir; PATCH gövdesine girmez", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...KAT_BOTH, ref_price: "1300.00" }));
    await renderThree();
    await user.click(screen.getByRole("button", { name: /KAB-0201.*düzenle/i }));
    const edit = within(screen.getByTestId("wik-edit-i-kb"));
    expect(edit.getByTestId("wik-source-code")).toHaveTextContent("15.100.1001");
    expect(edit.getByTestId("wik-ref-date")).toHaveTextContent("Bakanlık · 01.01.2026");
    expect(edit.queryByRole("textbox", { name: /bakanlık|kaynak|tarih/i })).not.toBeInTheDocument();
    const price = edit.getByLabelText("Referans fiyat");
    await user.clear(price);
    await user.type(price, "1300,00");
    await user.click(edit.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(backendClient.PATCH).toHaveBeenCalled());
    expect(vi.mocked(backendClient.PATCH).mock.calls[0]?.[1]).toMatchObject({ body: { ref_price: "1300.00" } });
    const sent = (vi.mocked(backendClient.PATCH).mock.calls[0] as unknown as [string, { body: object }])[1].body;
    expect(Object.keys(sent)).toEqual(["ref_price"]);
  });

  it("servis 422 zarfı {detail: string, errors: [...]} satırda detail metniyle görünür", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(
      failBody(422, { detail: "Bakanlık no zaten kayıtlı", errors: [{ index: 0, field: "source_code" }] }),
    );
    await renderThree();
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const edit = within(screen.getByTestId("wik-edit-i-bet"));
    await user.clear(edit.getByLabelText("Tarif"));
    await user.type(edit.getByLabelText("Tarif"), "Beton");
    await user.click(edit.getByRole("button", { name: "Kaydet" }));
    expect(await edit.findByText("Bakanlık no zaten kayıtlı")).toBeInTheDocument();
  });

  it("pydantic 422 zarfı {detail: [{loc,msg,type}]} satırda ilk msg ile görünür (çökme yok)", async () => {
    const user = userEvent.setup();
    vi.mocked(backendClient.PATCH).mockResolvedValue(
      failBody(422, { detail: [{ loc: ["body", "name"], msg: "Tarif çok uzun", type: "string_too_long" }] }),
    );
    await renderThree();
    await user.click(screen.getByRole("button", { name: /KAB-0001.*düzenle/i }));
    const edit = within(screen.getByTestId("wik-edit-i-bet"));
    await user.clear(edit.getByLabelText("Tarif"));
    await user.type(edit.getByLabelText("Tarif"), "Beton");
    await user.click(edit.getByRole("button", { name: "Kaydet" }));
    expect(await edit.findByText("Tarif çok uzun")).toBeInTheDocument();
  });
});

describe("KAT-F1.1 EK · eski harf yazımlı birim ('kg') düzenlemede kanonik seçenekte görünür", () => {
  it("uom 'kg' → birim seçicide 'Kg' seçili; dokunmadan kaydet → PATCH gövdesinde uom YOK", async () => {
    const user = userEvent.setup();
    const kgItem = { ...BETON, id: "i-kg", poz_no: "KAB-0301", name: "Kg kalemi", uom: "kg" };
    mockGets({ disciplines: [D_KAB, D_DUV], items: [kgItem] });
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...kgItem, name: "Kg kalemi 2" }));
    renderScreen();
    await screen.findByText("Kg kalemi");
    await user.click(screen.getByRole("button", { name: /KAB-0301.*düzenle/i }));
    const edit = within(screen.getByTestId("wik-edit-i-kg"));
    const select = edit.getByLabelText("Birim") as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe("Kg");
    await user.clear(edit.getByLabelText("Tarif"));
    await user.type(edit.getByLabelText("Tarif"), "Kg kalemi 2");
    await user.click(edit.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(backendClient.PATCH).toHaveBeenCalled());
    const sent = (vi.mocked(backendClient.PATCH).mock.calls[0] as unknown as [string, { body: object }])[1].body;
    expect(Object.keys(sent)).toEqual(["name"]);
  });
});
