/**
 * Ekranlar ARASI taşınan URL sorgu anahtarlarının TEK tanım yeri.
 *
 * KÖK OLAY (ölçüldü): `PROJECT_PARAM = "proje"` ON üretim dosyasında yerelce
 * yeniden tanımlıydı, `BLOCK_PARAM = "blok"` ikisinde; hiçbiri ötekini ithal
 * etmiyordu (`command grep -rn 'import.*PROJECT_PARAM' src` → 0 satır). Üretici
 * ile tüketici AYRI dosyalardadır — `BlockCreateView` kayıttan sonra
 * `?proje=…&blok=…` kurar, `BulkUnitCreateView` onu okur — ve iki tarafı
 * birbirine bağlayan tek şey dize eşitliğiydi. İki tarafın da tipi `string`
 * olduğu için anahtar bir gün değişirse TypeScript hiçbir şey söylemez, zincir
 * SESSİZCE kopar ve kullanıcı boş seçicili bir ekrana düşer.
 *
 * 🔴 BU MODÜL BUGÜNKÜ URL'LERİ BİREBİR ÜRETİR; değerler değişmedi. Kazanç, bir
 * sonraki ad değişikliğinin BURADA ve yalnız burada olmasıdır.
 *
 * Bekçi: `src/test-guards/url-param-key-guard.test.ts`.
 */

/** Seçili projenin URL bağlamı (`/satis`, `/belgeler`, `/personel`, …). */
export const PROJECT_PARAM = "proje";

/** Toplu ünite üretim ekranının blok bağlamı (BE 109 zinciri). */
export const BLOCK_PARAM = "blok";

/** TKL-F3 · Teklif revizyon no'su (`/teklif-hazirlama/{id}?rev=2`, yazdırma rotası da aynı anahtarı okur). */
export const OFFER_REV_PARAM = "rev";

/** TKL-F3 · Teklif yazdırma türü (`/teklif-hazirlama/{id}/yazdir?tur=isveren|ic`). */
export const OFFER_PRINT_KIND_PARAM = "tur";

/** TKL-F4 · Seçili teklif şablonu (`/teklif-hazirlama/sablonlar?sablon={id}` seçili kart; `/teklif-hazirlama/yeni?sablon={id}` önseçim). */
export const OFFER_TEMPLATE_PARAM = "sablon";

/** IZN-F2 · Sayfa İzinleri'nde seçili rol (`/ayarlar/izin-matrisi?rol={id}`; Rol Yönetimi kartındaki bağlantı kurar). */
export const ROLE_PARAM = "rol";

/** `tur` değerleri: işveren görünümü (yalnız satış fiyatı) ya da iç döküm (maliyet + kâr). */
export type OfferPrintKind = "isveren" | "ic";
