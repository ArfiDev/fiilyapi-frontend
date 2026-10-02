import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeGroup, makeItem } from "@/components/offers/offer-item-fixtures";
import { BETON, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { resetPermissions } from "./convert-permission.testkit";
import { makeWonRevision } from "./convert-fixtures";
import {
  NEXT_1, NEXT_2, bfBox, fieldText, fieldValue, groupOf, installBackend, priceDemir, qtyBox, renderConvert, rowOf, toStep2, toStep3,
  typeInto, wonBackend, fillStep1, rawControls,
} from "./convert-screen.testkit";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));
vi.mock("@/lib/auth/useModulePermission", async () => import("./convert-permission.testkit").then((m) => m.modulePermissionMock));
vi.mock("@/lib/auth/useDisciplineScope", async () => import("./convert-permission.testkit").then((m) => m.disciplineScopeMock));

const FIXED_NOW = new Date("2026-10-02T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  resetPermissions();
  installBackend(wonBackend());
  return () => vi.useRealTimers();
});

const stepperButton = (name: RegExp) => within(screen.getByRole("navigation", { name: "Dönüştürme adımları" })).getByRole("button", { name });
const footerText = () => screen.getByTestId("convert-footer").querySelector(".convert-footer__note")?.textContent ?? "";

describe("Adım 1 · proje + sözleşme (plan §1, ÜS-F5-7…11)", () => {
  it("teklifin bilgileriyle önceden dolar: ad = teklif başlığı, tarihler (bugün İstanbul → +teslim süresi−1), il/no boş", async () => {
    renderConvert();
    expect(await screen.findByLabelText("Proje adı")).toHaveValue("Güneşkent Konut Kompleksi");
    expect(fieldValue("Proje kodu")).toBe("");
    expect(fieldValue("İl / İlçe")).toBe("");
    expect(fieldValue("Sözleşme no")).toBe("");
    expect(fieldValue("Sözleşme tarihi")).toBe("02.10.2026");
    expect(fieldValue("Başlangıç tarihi")).toBe("02.10.2026");
    expect(fieldValue("Bitiş tarihi")).toBe("25.11.2027");
    expect(screen.getByText("420 takvim günü · teklif koşullarından")).toBeInTheDocument();
    expect(footerText()).toBe("Adım 1 / 3 · Proje ve sözleşme kimliği");
  });

  it("İşveren kilitli (düzenlenemez) + 'Tekliften gelir · değiştirilemez'", async () => {
    renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(screen.getByText("Kuzey Gayrimenkul A.Ş.", { selector: ".convert-locked" })).toBeInTheDocument();
    expect(screen.getByText("Tekliften gelir · değiştirilemez")).toBeInTheDocument();
  });

  it("sözleşme no ve proje kodu alandan ÇIKINCA BÜYÜK HARFE çevrilir (TDN:309; F5.3b: yazarken değil — imleç sona atlamasın)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Sözleşme no"), "szl-2026-011");
    await user.type(screen.getByLabelText("Proje kodu"), "prj-2026-009");
    await user.tab();
    expect(fieldValue("Sözleşme no")).toBe("SZL-2026-011");
    expect(fieldValue("Proje kodu")).toBe("PRJ-2026-009");
  });

  it("proje kodu isteğe bağlı: ipucu 'Boş bırakılırsa otomatik'", async () => {
    renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(screen.getByText("Boş bırakılırsa otomatik")).toBeInTheDocument();
  });

  it("şantiye kartı varsayılan AÇIK: 'Tek şantiye aç: {ad}' + TDN:123 açıklaması AYNEN; ad kutusu boşken proje adı", async () => {
    const user = userEvent.setup();
    renderConvert();
    const site = await screen.findByRole("checkbox", { name: /Tek şantiye aç: Güneşkent Konut Kompleksi/ });
    expect(site).toBeChecked();
    expect(screen.getByText("Bütün sözleşme kalemleri bu şantiyeye bağlanır. Sonradan blok ekleyip kalemleri bölebilirsiniz.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Şantiye adı"), "A-Blok");
    expect(screen.getByRole("checkbox", { name: /Tek şantiye aç: A-Blok/ })).toBeInTheDocument();
    await user.click(site);
    expect(site).not.toBeChecked();
    expect(screen.queryByLabelText("Şantiye adı")).not.toBeInTheDocument();
  });

  it("fiyat farkı: teklif sabit → KAPALI (endeks alanları DOM'da yok); TÜİK → AÇIK + teklifin endeksi, D0 boş", async () => {
    renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(screen.getByRole("checkbox", { name: "Fiyat farkı uygulanacak" })).not.toBeChecked();
    expect(screen.queryByLabelText("Baz Endeks Değeri (D0)")).not.toBeInTheDocument();
  });

  it("TÜİK teklifte fiyat farkı açık gelir; D0 boşken 'Endeks tipi ve baz endeks değeri zorunludur.' ve adım ilerlemez", async () => {
    installBackend(wonBackend({ revision: makeWonRevision({ price_escalation: "tuik", price_index_type: "tufe" }) }));
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user);
    expect(screen.getByRole("checkbox", { name: "Fiyat farkı uygulanacak" })).toBeChecked();
    expect(screen.getByLabelText("Endeks Tipi")).toHaveValue("tufe");
    expect(fieldValue("Baz Endeks Değeri (D0)")).toBe("");
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    expect(screen.getByText("Endeks tipi ve baz endeks değeri zorunludur.")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-2")).not.toBeInTheDocument();
  });

  it("İLERİ KAPISI: il boşken 'Kalemlere geç →' adımı AÇMAZ, hata görünür; geçerli olunca açar", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.type(await screen.findByLabelText("Sözleşme no"), "szl-1");
    expect(screen.queryByText("İl / ilçe zorunludur.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    expect(screen.getByText("İl / ilçe zorunludur.")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-2")).not.toBeInTheDocument();
    expect(footerText()).toContain("Adım 1 / 3");
    await user.type(screen.getByLabelText("İl / İlçe"), "Ankara");
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    expect(await screen.findByTestId("convert-step-2")).toBeInTheDocument();
  });

  it("bitiş başlangıçtan önceyse 'Bitiş tarihi başlangıçtan önce olamaz.'", async () => {
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user);
    await typeInto(user, screen.getByLabelText("Bitiş tarihi"), "01.01.2026");
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    expect(screen.getByText("Bitiş tarihi başlangıçtan önce olamaz.")).toBeInTheDocument();
  });

  it("adım çubuğu: 3 adım, güncel adım aria-current; geri serbest, ileri atlama ÖNCEKİ adım geçersizken kapalı", async () => {
    const user = userEvent.setup();
    renderConvert();
    await screen.findByLabelText("Proje adı");
    expect(stepperButton(/Proje Bilgileri/)).toHaveAttribute("aria-current", "step");
    expect(within(stepperButton(/Proje Bilgileri/)).getByText("kod, sözleşme, tarih")).toBeInTheDocument();
    expect(stepperButton(/Kalemleri Gözden Geçir/)).toHaveTextContent("miktar ve fiyat");
    expect(stepperButton(/Onay/)).toHaveTextContent("oluştur");
    await user.click(stepperButton(/Onay/));
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    expect(screen.getByText("İl / ilçe zorunludur.")).toBeInTheDocument();
    await toStep2(user);
    await user.click(stepperButton(/Proje Bilgileri/));
    expect(screen.getByTestId("convert-step-1")).toBeInTheDocument();
  });

  it("adım 1 geçerli, adım 2 geçersizken çubuktan 'Onay'a basmak ADIM 2'ye götürür (hatalar vurgulu)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await fillStep1(user);
    await user.click(stepperButton(/Onay/));
    expect(await screen.findByTestId("convert-step-2")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    expect(within(rowOf("o:it-2")).getByText("Birim fiyat girin")).toBeInTheDocument();
  });
});

describe("Adım 2 · kalemleri gözden geçir (plan §1, TDN:128-180)", () => {
  it("gruplar sırasıyla başlık satırı + 'N kalem'; satırda poz/tarif/birim, teklif→sözleşme kutuları ve 'teklif …' alt satırları", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(footerText()).toContain("Adım 2 / 3");
    expect(within(groupOf("g:g-kaba")).getByText("KABA İNŞAAT")).toBeInTheDocument();
    expect(within(groupOf("g:g-kaba")).getByText("2 kalem")).toBeInTheDocument();
    expect(within(groupOf("g:g-ince")).getByText("1 kalem")).toBeInTheDocument();
    const beton = rowOf("o:it-1");
    expect(within(beton).getByText(BETON.poz_no)).toBeInTheDocument();
    expect(within(beton).getByText(BETON.name)).toBeInTheDocument();
    expect(within(beton).getByText(BETON.uom)).toBeInTheDocument();
    expect(qtyBox("o:it-1")).toHaveValue("10");
    expect(within(beton).getByText("teklif 10")).toBeInTheDocument();
    expect(bfBox("o:it-1")).toHaveValue("128,80");
    expect(within(beton).getByText("teklif ₺128,80")).toBeInTheDocument();
    expect(within(beton).getByText("₺1.288,00")).toBeInTheDocument();
    expect(within(beton).getByText("teklif ₺1.288,00")).toBeInTheDocument();
    expect(within(beton).getByText("=")).toBeInTheDocument();
  });

  it("fiyatsız teklif kalemi: B.F. BOŞ + zorunlu — 'Birim fiyat girin' gösterilir ve adım ilerlemez (ÜS-F5-16)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(bfBox("o:it-2")).toHaveValue("");
    expect(within(rowOf("o:it-2")).queryByText("Birim fiyat girin")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(within(rowOf("o:it-2")).getByText("Birim fiyat girin")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-step-3")).not.toBeInTheDocument();
    await priceDemir(user, "100");
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(await screen.findByTestId("convert-step-3")).toBeInTheDocument();
  });

  it("miktar değişince 'Miktar değişti' etiketi + mavi vurgu YALNIZ miktar kutusunda; fiyat da değişirse etiket 'Fiyat değişti' (fiyat önce)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await typeInto(user, qtyBox("o:it-1"), "12");
    expect(within(rowOf("o:it-1")).getByText("Miktar değişti")).toBeInTheDocument();
    expect(qtyBox("o:it-1")).toHaveClass("convert-box--changed");
    expect(bfBox("o:it-1")).not.toHaveClass("convert-box--changed");
    await typeInto(user, bfBox("o:it-1"), "130");
    expect(within(rowOf("o:it-1")).getByText("Fiyat değişti")).toBeInTheDocument();
    expect(within(rowOf("o:it-1")).queryByText("Miktar değişti")).not.toBeInTheDocument();
    expect(bfBox("o:it-1")).toHaveClass("convert-box--changed");
  });

  it("T30: belirsiz '28.5' sessizce okunmaz — 'Ondalık için virgül kullanın (ör. 28,50)' hatası", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await typeInto(user, bfBox("o:it-1"), "28.5");
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    expect(within(rowOf("o:it-1")).getByText(/Ondalık için virgül kullanın/)).toBeInTheDocument();
  });

  it("satır çıkarma: etiket 'Çıkarıldı', fark 'çıkarıldı', kutular kapalı, tutar ₺0,00; çip ve özet sayaçları güncellenir", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.getByText("3 dahil · 0 çıkarıldı · 0 değişti · 0 yeni")).toBeInTheDocument();
    await user.click(within(rowOf("o:it-3")).getByRole("checkbox", { name: "Sözleşmeye dahil et" }));
    const siva = rowOf("o:it-3");
    expect(within(siva).getByText("Çıkarıldı")).toBeInTheDocument();
    expect(within(siva).getByText("çıkarıldı")).toBeInTheDocument();
    expect(qtyBox("o:it-3")).toBeDisabled();
    expect(bfBox("o:it-3")).toBeDisabled();
    expect(within(siva).getByText("₺0,00")).toBeInTheDocument();
    expect(siva).toHaveClass("convert-row--excluded");
    expect(screen.getByText("2 dahil · 1 çıkarıldı · 0 değişti · 0 yeni")).toBeInTheDocument();
    expect(within(groupOf("g:g-ince")).getByText("sözleşmeye geçmeyecek")).toBeInTheDocument();
    expect(fieldText(screen.getByTestId("convert-summary"), "Çıkarılan kalem · 1")).toContain("−₺5.000,00");
  });

  it("özet: teklif tutarı (Rev.2) · sözleşme tutarı · fark (+%) · satırlar · KDV %20 dahil — F5.2 modeliyle", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await priceDemir(user, "100"); // 2 ton × 100 = 200
    const summary = screen.getByTestId("convert-summary");
    expect(fieldText(summary, "Teklif tutarı · Rev.2")).toContain("₺6.288,00");
    expect(fieldText(summary, "Sözleşme tutarı")).toContain("₺6.488,00");
    expect(within(summary).getByText("Fark").parentElement?.textContent).toContain("+₺200,00");
    expect(within(summary).getByText("Fark").parentElement?.textContent).toContain("+%3,2");
    expect(fieldText(summary, "Fiyat / miktar değişen · 1")).toContain("+₺200,00");
    expect(fieldText(summary, "Sözleşmeye geçen kalem")).toContain("3");
    expect(fieldText(summary, "KDV %20 dahil")).toContain("₺7.785,60");
    expect(footerText()).toBe("Adım 2 / 3 · 1 kalemde değişiklik · fark +%3,2");
  });

  it("🔴 ekran Σ'sı SATIR BAŞI yuvarlamayla (ROUND_HALF_UP): 1,005 × 1,00 = ₺1,01 (float 1,00 derdi)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    await typeInto(user, qtyBox("o:it-1"), "1,005");
    await typeInto(user, bfBox("o:it-1"), "1");
    expect(within(rowOf("o:it-1")).getByText("₺1,01")).toBeInTheDocument();
    await priceDemir(user, "0"); // demir 0
    await typeInto(user, bfBox("o:it-3"), "0"); // sıva 0
    expect(fieldText(screen.getByTestId("convert-summary"), "Sözleşme tutarı")).toContain("₺1,01");
  });

  it("'+ Katalogdan kalem ekle' F5.4 ile ETKİN (seçici davranışı: ConvertScreen.catalog.test)", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.getByRole("button", { name: "+ Katalogdan kalem ekle" })).toBeEnabled();
  });

  it("alt bilgi şeridi üç parça TDN:176-178 AYNEN", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.getByText("tekliften farklı")).toBeInTheDocument();
    expect(screen.getByText("Fark = sözleşme tutarı ÷ teklif tutarı − 1")).toBeInTheDocument();
    expect(screen.getByText("Çıkarılan kalem sözleşmeye kopyalanmaz, teklifte kalır")).toBeInTheDocument();
  });

  it("kod/ad düzenleyicisi YALNIZ çakışan satır/grupta açılır (SO-29/30/52); çakışma çözülünce kapanmaz", async () => {
    const dup = makeWonRevision({
      groups: [
        makeGroup("g-a", "KABA", 0, [makeItem({ id: "it-1" })]),
        makeGroup("g-b", "KABA", 1, [makeItem({ id: "it-9", catalog_item_id: SIVA.id, description: SIVA.name, unit: SIVA.uom, poz_no: BETON.poz_no })]),
      ],
    });
    installBackend(wonBackend({ revision: dup }));
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(within(rowOf("o:it-1")).getByLabelText("Poz no")).toHaveValue(BETON.poz_no);
    expect(within(rowOf("o:it-9")).getByLabelText("Poz no")).toBeInTheDocument();
    expect(within(rowOf("o:it-1")).getByText(`Kalem kodu tekrar ediyor (${BETON.poz_no})`)).toBeInTheDocument();
    expect(within(groupOf("g:g-a")).getByLabelText("Grup adı")).toBeInTheDocument();
    expect(within(groupOf("g:g-b")).getByText("Bu adla grup var")).toBeInTheDocument();
    await typeInto(user, within(rowOf("o:it-9")).getByLabelText("Poz no"), "DUV-0099");
    expect(within(rowOf("o:it-9")).getByLabelText("Poz no")).toHaveValue("DUV-0099");
    expect(within(rowOf("o:it-1")).queryByLabelText("Poz no")).not.toBeInTheDocument();
  });

  it("çakışma yokken hiçbir satırda kod/ad düzenleyicisi yok", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.queryByLabelText("Poz no")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Grup adı")).not.toBeInTheDocument();
  });
});

describe("karışık disiplinli grup (ÜS-F5-20)", () => {
  const mixed = () =>
    makeWonRevision({
      groups: [
        makeGroup("g-m", "KARMA", 0, [
          makeItem({ id: "it-1" }),
          makeItem({ id: "it-3", catalog_item_id: SIVA.id, description: SIVA.name, unit: SIVA.uom, poz_no: SIVA.poz_no, quantity: "100.000", customer: { unit_price: "50.00", amount: "5000.00" } }),
        ]),
      ],
    });

  it("şantiye AÇIKKEN amber 'Karışık disiplin' çipi + disiplin seçici (adlarla); seçim gövdeye girer", async () => {
    installBackend(wonBackend({ revision: mixed() }));
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    const header = groupOf("g:g-m");
    expect(within(header).getByText("Karışık disiplin")).toBeInTheDocument();
    const select = within(header).getByLabelText("Disiplin");
    expect(within(select).getByRole("option", { name: "Duvar & Sıva" })).toBeInTheDocument();
    await user.selectOptions(select, "d-duv");
    expect(select).toHaveValue("d-duv");
  });

  it("şantiye KAPALIYKEN seçici yok + not 'Şantiye açılmadığı için eşleme Planlama'da yapılır'", async () => {
    installBackend(wonBackend({ revision: mixed() }));
    const user = userEvent.setup();
    renderConvert();
    await screen.findByLabelText("Proje adı");
    await user.click(screen.getByRole("checkbox", { name: /Tek şantiye aç/ }));
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    const header = await screen.findByTestId("convert-group-g:g-m");
    expect(within(header).queryByLabelText("Disiplin")).not.toBeInTheDocument();
    expect(within(header).getByText("Şantiye açılmadığı için eşleme Planlama'da yapılır")).toBeInTheDocument();
  });

  it("tek disiplinli grupta çip ve seçici yok", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep2(user);
    expect(screen.queryByText("Karışık disiplin")).not.toBeInTheDocument();
  });
});

describe("Adım 3 · onay (plan §1)", () => {
  it("'Oluşturulacak': PROJE / SÖZLEŞME / ŞANTİYE satırları ve 'Tutarlar · KDV hariç'", async () => {
    const user = userEvent.setup();
    renderConvert();
    await toStep3(user);
    expect(footerText()).toBe("Adım 3 / 3 · Kontrol edip oluşturun");
    expect(screen.getByText("Oluşturulacak")).toBeInTheDocument();
    const step = screen.getByTestId("convert-step-3");
    expect(within(step).getByText("Otomatik · Güneşkent Konut Kompleksi")).toBeInTheDocument();
    expect(within(step).getByText("İşveren Kuzey Gayrimenkul A.Ş. · 02.10.2026 → 25.11.2027")).toBeInTheDocument();
    expect(within(step).getByText("SZL-2026-011 · 02.10.2026")).toBeInTheDocument();
    expect(within(step).getByText("3 kalem · ₺6.488,00 KDV hariç · katalog bağlı")).toBeInTheDocument();
    expect(within(step).getByText("Güneşkent Konut Kompleksi", { selector: ".convert-make__title" })).toBeInTheDocument();
    expect(within(step).getByText("Bütün kalemler bu şantiyeye bağlanır")).toBeInTheDocument();
    expect(within(step).getByText("Tutarlar · KDV hariç")).toBeInTheDocument();
    expect(fieldText(step, "Teklif tutarı")).toContain("₺6.288,00");
    expect(fieldText(step, "Sözleşme tutarı")).toContain("₺6.488,00");
    expect(fieldText(step, "KDV dahil")).toContain("₺7.785,60");
    expect(within(step).getByText("Teklif salt okunur arşive geçer; kalemler katalog bağıyla sözleşmeye kopyalanır.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projeyi ve Sözleşmeyi Oluştur" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: NEXT_2 })).not.toBeInTheDocument();
  });

  it("kod girilmişse PROJE satırı '{kod} · {ad}'; şantiye kapalıysa 'Şantiye açılmayacak' + 'Şantiyeyi sonra proje sayfasından açın'", async () => {
    const user = userEvent.setup();
    renderConvert();
    await user.click(await screen.findByRole("checkbox", { name: /Tek şantiye aç/ }));
    await user.type(screen.getByLabelText("Proje kodu"), "prj-2026-009");
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: NEXT_1 }));
    await priceDemir(user);
    await user.click(screen.getByRole("button", { name: NEXT_2 }));
    const step = await screen.findByTestId("convert-step-3");
    expect(within(step).getByText("PRJ-2026-009 · Güneşkent Konut Kompleksi")).toBeInTheDocument();
    expect(within(step).getByText("Şantiye açılmayacak")).toBeInTheDocument();
    expect(within(step).getByText("Şantiyeyi sonra proje sayfasından açın")).toBeInTheDocument();
  });

  it("geri gidilebilir; ham kontrol yok (üç adım boyunca)", async () => {
    const user = userEvent.setup();
    const { container } = renderConvert();
    await toStep3(user);
    expect(rawControls(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "← Geri" }));
    expect(await screen.findByTestId("convert-step-2")).toBeInTheDocument();
    expect(rawControls(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "← Geri" }));
    expect(await screen.findByTestId("convert-step-1")).toBeInTheDocument();
    expect(rawControls(container)).toEqual([]);
    expect(screen.queryByRole("button", { name: "← Geri" })).not.toBeInTheDocument();
  });
});
