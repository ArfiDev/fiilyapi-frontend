import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "./nav-config";

/**
 * IZN-F1.2/F1.3 · BEKÇİ — her menü öğesinin `pageKey` ve `extraPageKeys` değerleri backend sayfa
 * kataloğuyla (IZN-B1, `app/core/sayfalar.py`, backend b244678) uyumludur.
 *
 * Katalog frontend'de statik YOKTUR; iki kaynak okunur:
 *  - geçerli anahtar kümesi: `openapi/openapi.json` → `PageKey` enum'u (gerçek sözleşme);
 *  - anahtar → ad/rota: aşağıdaki sabit, backend kataloğunun ŞİRKET sayfalarının (`_HAM` no 1-59)
 *    birebir kopyasıdır. Katalog değişirse backend devri bu testi kırmızıya çevirir.
 *
 * Alt sayfa kümesi katalogdan türetilir: ad'ı kökle aynı "<Menü adı> › " önekini taşıyan YA DA
 * rotası kök rotanın altında olan şirket sayfaları (Muhasebe › Mizan, /satis/blok-ekle …).
 */
export const COMPANY_CATALOG: readonly (readonly [string, string, string])[] = [
  ["genel.gosterge_paneli", "Gösterge Paneli", "/"],
  ["genel.onay_kutusu", "Onay Kutusu", "/onay-kutusu"],
  ["genel.fiil_ai", "FİİL AI", "/asistan"],
  ["genel.raporlar", "Raporlar", "/raporlar"],
  ["genel.projeler", "Projeler", "/projeler"],
  ["genel.proje_takvimi", "Proje Takvimi", "/projeler/takvim"],
  ["saha.puantaj", "Puantaj", "/puantaj"],
  ["saha.makine_ekipman", "Makine & Ekipman › Ekipman Listesi", "/makine"],
  ["saha.makine_calisma", "Makine & Ekipman › Çalışma Kaydı", "/makine/calisma"],
  ["saha.makine_yakit", "Makine & Ekipman › Yakıt Takibi", "/makine/yakit"],
  ["saha.makine_kira", "Makine & Ekipman › Kira Hakedişi", "/makine/kira"],
  ["saha.gunluk_kayit", "Günlük Kayıt", "/gunluk-kayit"],
  ["ik.personel", "Personel › Personel Listesi", "/personel"],
  ["ik.izin_yonetimi", "Personel › İzin Yönetimi", "/personel/izinler"],
  ["ik.belge_sertifika", "Personel › Belge & Sertifika", "/personel/belgeler"],
  ["planlama.panel", "Planlama Paneli", "/planlama/panel"],
  ["planlama.adam_saat_butcesi", "Adam-Saat Bütçesi", "/planlama/adam-saat-butcesi"],
  ["planlama.gunluk_rapor", "Günlük İlerleme Raporu", "/planlama/gunluk-rapor"],
  ["planlama.haftalik_qurr", "Haftalık QURR", "/planlama/haftalik-qurr"],
  ["planlama.birim_oran_katalogu", "Birim Oran Kataloğu", "/planlama/birim-oran-katalogu"],
  ["planlama.disiplin_yonetimi", "Disiplin Yönetimi", "/planlama/disiplin-yonetimi"],
  ["teklif.teklif_hazirlama", "Teklif Hazırlama", "/teklif-hazirlama"],
  ["teklif.sablonlar", "Teklif Şablonları", "/teklif-hazirlama/sablonlar"],
  ["teklif.sozlesmeler", "Sözleşmeler (İşveren · Taşeron)", "/sozlesmeler"],
  ["teklif.taseron_firmalar", "Taşeron Firmalar", "/sozlesmeler/taseronlar"],
  ["teklif.isveren_sozlesme", "İşveren Sözleşme Detayı", "/sozlesmeler/isveren/[projectId]"],
  ["teklif.poz_dagilimi", "İşveren Sözleşmesi › Poz Dağılımı", "/sozlesmeler/isveren/[projectId]/poz-dagilimi"],
  ["teklif.taseron_sozlesme", "Taşeron Sözleşme Detayı", "/sozlesmeler/taseron/[contractId]"],
  ["teklif.is_kalemi_katalogu", "İş Kalemi Kataloğu", "/planlama/is-kalemi-katalogu"],
  ["stok.stok_depo", "Stok & Depo", "/stok"],
  ["stok.satinalma_talepleri", "Satınalma & Teklif › Satın Alma Talepleri", "/satinalma"],
  ["stok.siparisler", "Satınalma & Teklif › Siparişler", "/satinalma/siparisler"],
  ["stok.tedarikciler", "Satınalma & Teklif › Tedarikçiler", "/satinalma/tedarikciler"],
  ["stok.teklif_karsilastirma", "Satınalma & Teklif › Teklif Karşılaştırma", "/satinalma/talepler/[id]/teklifler"],
  ["mali.satis", "Satış Yönetimi", "/satis"],
  ["mali.satis_blok", "Satış › Blok Ekle", "/satis/blok-ekle"],
  ["mali.satis_unite", "Satış › Ünite Ekle", "/satis/unite-ekle"],
  ["mali.satis_toplu_uretim", "Satış › Toplu Üretim", "/satis/toplu-uretim"],
  ["mali.satis_excel", "Satış › Excel İçe Aktar", "/satis/excel-ice-aktar"],
  ["mali.satis_paylasim", "Satış › Paylaşım Girişi", "/satis/paylasim-girisi"],
  ["mali.yevmiye", "Muhasebe › Yevmiye", "/muhasebe"],
  ["mali.hesap_plani", "Muhasebe › Hesap Planı", "/muhasebe/hesap-plani"],
  ["mali.mizan", "Muhasebe › Mizan", "/muhasebe/mizan"],
  ["mali.kdv_beyani", "Muhasebe › KDV Beyanı", "/muhasebe/kdv-beyani"],
  ["mali.banka_mutabakati", "Muhasebe › Banka Mutabakatı", "/muhasebe/banka-mutabakati"],
  ["mali.donem_kapanisi", "Muhasebe › Dönem Kapanışı", "/muhasebe/donem-kapanisi"],
  ["mali.fatura", "Fatura Yönetimi (Giden · Gelen)", "/faturalar"],
  ["mali.hazine", "Hazine", "/hazine"],
  ["mali.cek_odeme", "Çek & Ödeme", "/hazine/cek-senet"],
  ["mali.hakedis_isveren", "Hakedişler › İşveren", "/hakedisler"],
  ["mali.hakedis_taseron", "Hakedişler › Taşeron", "/hakedisler/taseron"],
  ["mali.gelir_tablosu", "Mali Tablolar › Gelir Tablosu", "/mali-tablolar"],
  ["mali.bilanco", "Mali Tablolar › Bilanço", "/mali-tablolar/bilanco"],
  ["mali.nakit_akisi", "Mali Tablolar › Nakit Akışı", "/mali-tablolar/nakit-akisi"],
  ["mali.bordro", "Bordro › Aylık Bordro", "/bordro"],
  ["mali.bordro_gecmis", "Bordro › Bordro Geçmişi", "/bordro/gecmis"],
  ["mali.sgk_bildirimi", "Bordro › SGK Bildirimi", "/bordro/sgk"],
  ["mali.sirket_varliklari", "Şirket Varlıkları", "/sirket-varliklari"],
  ["mali.belge_arsivi", "Belge Arşivi", "/belgeler"],
];

const CATALOG_BY_KEY = new Map(COMPANY_CATALOG.map(([key, name, route]) => [key, { name, route }]));
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Türetme kuralı (birleşim) sonucu alt sayfası çıktığı halde menü öğesine KASITLI bağlanmayanlar.
 * Eksik/fazla alt anahtar yine kırmızıdır; yalnız aşağıdaki iki öğe türetmeden muaftır.
 */
const NOT_COVERED_BY_DERIVATION: Record<string, string> = {
  "teklif.teklif_hazirlama": "Teklif Şablonları (/teklif-hazirlama/sablonlar) KENDİ menü öğesidir; anahtar tekrar edemez",
  "mali.hazine": "Çek & Ödeme (/hazine/cek-senet) KENDİ menü öğesidir; anahtar tekrar edemez",
};

function menuPrefix(catalogName: string): string | null {
  return catalogName.includes(" › ") ? catalogName.split(" › ")[0] : null;
}

/**
 * Kök sayfanın alt sayfaları (kök HARİÇ): ŞİRKET sayfası ve (a) ad'ı kökle aynı "<Menü> › " önekini
 * taşıyor YA DA (b) rotası kök rota + "/" ile başlıyor. Kök rota "/" (Gösterge Paneli) için (b) uygulanmaz.
 */
function derivedSubPageKeys(rootKey: string): string[] {
  const root = CATALOG_BY_KEY.get(rootKey);
  if (!root) return [];
  const prefix = menuPrefix(root.name);
  return COMPANY_CATALOG.filter(([key, name, route]) => {
    if (key === rootKey) return false;
    const samePrefix = prefix !== null && menuPrefix(name) === prefix;
    const underRoute = root.route !== "/" && route.startsWith(`${root.route}/`);
    return samePrefix || underRoute;
  }).map(([key]) => key);
}

function pageKeyEnum(): string[] {
  const contract = JSON.parse(readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8")) as {
    components: { schemas: { PageKey: { enum: string[] } } };
  };
  return contract.components.schemas.PageKey.enum;
}

const allKeysOf = (item: (typeof NAV_ITEMS)[number]): string[] => [item.pageKey, ...(item.extraPageKeys ?? [])];

describe("NAV_GROUPS · pageKey bekçisi (IZN-F1.2/F1.3)", () => {
  it("her menü öğesinin pageKey ve extraPageKeys değerleri sözleşmedeki PageKey enum'unda vardır", () => {
    const valid = new Set(pageKeyEnum());
    const unknown = NAV_ITEMS.flatMap(allKeysOf).filter((key) => !valid.has(key));
    expect(unknown).toEqual([]);
  });

  it("anahtarlar menüde benzersizdir (iki öğe aynı sayfa anahtarını paylaşmaz, öğe içinde tekrar yok)", () => {
    const keys = NAV_ITEMS.flatMap(allKeysOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her öğenin href'i, pageKey'inin katalog rotasıyla BİREBİR aynıdır", () => {
    const mismatched = NAV_ITEMS.filter((item) => CATALOG_BY_KEY.get(item.pageKey)?.route !== item.href).map(
      (item) => `${item.label}: ${item.pageKey} → katalog "${CATALOG_BY_KEY.get(item.pageKey)?.route}", nav "${item.href}"`,
    );
    expect(mismatched).toEqual([]);
  });

  it("extraPageKeys katalogda vardır ve kök sayfanın türetilmiş alt sayfasıdır", () => {
    for (const item of NAV_ITEMS) {
      for (const key of item.extraPageKeys ?? []) {
        expect(CATALOG_BY_KEY.has(key), `${item.label}: ${key} katalogda yok`).toBe(true);
        expect(derivedSubPageKeys(item.pageKey), `${item.label}: ${key} türetilmiş alt sayfa değil`).toContain(key);
      }
    }
  });

  it("alt sayfa kümesi katalogdan türetilenle TAMAMEN eşittir (eksik de fazla da kırmızı)", () => {
    const diffs = NAV_ITEMS.filter((item) => !(item.pageKey in NOT_COVERED_BY_DERIVATION)).flatMap((item) => {
      const expected = derivedSubPageKeys(item.pageKey).sort();
      const actual = [...(item.extraPageKeys ?? [])].sort();
      return JSON.stringify(expected) === JSON.stringify(actual)
        ? []
        : [`${item.label}: beklenen [${expected}] ≠ nav [${actual}]`];
    });
    expect(diffs).toEqual([]);
  });

  it("extraPageKeys taşıyan öğeler TAM OLARAK on: Muhasebe, Mali Tablolar, Hakedişler, Satınalma & Teklif, Makine & Ekipman, Bordro, Personel, Satış Yönetimi, Projeler, Sözleşmeler", () => {
    const withExtras = NAV_ITEMS.filter((item) => (item.extraPageKeys ?? []).length > 0).map((item) => item.label);
    expect(withExtras.sort()).toEqual(
      [
        "Bordro",
        "Hakedişler",
        "Makine & Ekipman",
        "Muhasebe",
        "Mali Tablolar",
        "Satınalma & Teklif",
        "Personel",
        "Satış Yönetimi",
        "Projeler",
        "Sözleşmeler",
      ].sort(),
    );
  });

  it("istisna listesi bayatlamaz: istisnadaki öğe gerçekten menüde ve türetilmiş alt sayfası var", () => {
    for (const key of Object.keys(NOT_COVERED_BY_DERIVATION)) {
      expect(NAV_ITEMS.some((item) => item.pageKey === key), `${key} menüde yok`).toBe(true);
      expect(derivedSubPageKeys(key).length, `${key} istisnası gereksiz`).toBeGreaterThan(0);
    }
  });
});
