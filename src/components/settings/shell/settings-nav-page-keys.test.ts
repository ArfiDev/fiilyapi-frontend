import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_NAV } from "./settings-nav-config";

/**
 * IZN-F2.2 · BEKÇİ — Ayarlar menüsü öğelerinin `pageKey` değerleri backend sayfa kataloğuyla
 * (`app/core/sayfalar.py`, grup `ayarlar`) uyumludur. `nav-page-keys.test.ts` (ana kabuk) desenidir.
 *
 *  - geçerli anahtar kümesi: `openapi/openapi.json` → `PageKey` enum'u (gerçek sözleşme);
 *  - anahtar → ad/rota: aşağıdaki sabit, kataloğun AYARLAR sayfalarının (no 89-100) birebir kopyasıdır.
 *    `ayarlar.gelistirme` (no 60) kasıtlı olarak Ayarlar menüsünde DEĞİL (kabuk menüsünde, yalnız SisYön).
 *    Katalog değişirse backend devri bu testi kırmızıya çevirir.
 */
const SETTINGS_CATALOG: readonly (readonly [string, string, string])[] = [
  ["ayarlar.sirket_bilgileri", "Şirket Bilgileri", "/ayarlar/sirket-bilgileri"],
  ["ayarlar.bildirimler", "Bildirimler", "/ayarlar/bildirimler"],
  ["ayarlar.gorunum", "Görünüm", "/ayarlar/gorunum"],
  ["ayarlar.planlama", "Planlama Ayarları", "/ayarlar/planlama"],
  ["ayarlar.kullanicilar", "Kullanıcılar", "/ayarlar/kullanicilar"],
  ["ayarlar.rol_yonetimi", "Rol Yönetimi", "/ayarlar/roller"],
  ["ayarlar.sayfa_izinleri", "Sayfa İzinleri", "/ayarlar/izin-matrisi"],
  ["ayarlar.onay_rolleri", "Onay Rolleri ve Eşik", "/ayarlar/onay-rolleri"],
  ["ayarlar.bordro_oranlari", "Bordro Oranları", "/ayarlar/bordro-oranlari"],
  ["ayarlar.entegrasyonlar", "Entegrasyonlar", "/ayarlar/entegrasyonlar"],
  ["ayarlar.yedekleme", "Yedekleme", "/ayarlar/yedekleme"],
  ["ayarlar.denetim_gunlugu", "Denetim Günlüğü", "/ayarlar/denetim-gunlugu"],
];

const CATALOG_BY_KEY = new Map(SETTINGS_CATALOG.map(([key, , route]) => [key, route]));
const ITEMS = SETTINGS_NAV.flatMap((group) => group.items);

function pageKeyEnum(): string[] {
  const contract = JSON.parse(readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8")) as {
    components: { schemas: { PageKey: { enum: string[] } } };
  };
  return contract.components.schemas.PageKey.enum;
}

describe("SETTINGS_NAV · pageKey bekçisi (IZN-F2.2)", () => {
  it("her Ayarlar öğesinin pageKey'i sözleşmedeki PageKey enum'unda vardır", () => {
    const valid = new Set(pageKeyEnum());
    expect(ITEMS.map((item) => item.pageKey).filter((key) => !valid.has(key))).toEqual([]);
  });

  it("anahtarlar benzersizdir ve katalogdaki on iki Ayarlar sayfasının TAMAMINI kapsar", () => {
    const keys = ITEMS.map((item) => item.pageKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(SETTINGS_CATALOG.map(([key]) => key).sort());
  });

  it("her öğenin href'i, pageKey'inin katalog rotasıyla BİREBİR aynıdır", () => {
    const mismatched = ITEMS.filter((item) => CATALOG_BY_KEY.get(item.pageKey) !== item.href).map(
      (item) => `${item.label}: ${item.pageKey} → katalog "${CATALOG_BY_KEY.get(item.pageKey)}", menü "${item.href}"`,
    );
    expect(mismatched).toEqual([]);
  });

  it("Sayfa İzinleri rotası eski izin matrisi URL'inde KALIR", () => {
    expect(ITEMS.find((item) => item.pageKey === "ayarlar.sayfa_izinleri")).toMatchObject({
      label: "Sayfa İzinleri",
      href: "/ayarlar/izin-matrisi",
    });
  });
});
