/**
 * F-KIRINTI · üst çubuk yol göstergesinin (kırıntı) DÜĞÜM TİPLERİ.
 *
 * KÖK OLAY: `DRILL-KALDIR` dilimi (kullanıcı kararı 2026-08-29) proje/şantiye
 * drill kenar çubuğunu kaldırdı çünkü ana menüyü örtüyordu. O dilimin kendi
 * ölçümü tek bir gezinme yolunun karşılıksız kaldığını yazıyor:
 * *"Çubuğun TEK karşılıksız kalan öğesi ŞANTİYEDEN PROJEYE ÇIKIŞ'tı."*
 * Kullanıcının istediği kırıntı bu yüzden bir süs değil, o kaybın telafisidir.
 *
 * ─── Neden bir AĞAÇ, neden düz bir eşleme değil ───────────────────────────
 * Kırıntı yol segmentlerini SIRAYLA okur; her segmentin etiketi ATASINA
 * bağlıdır (`ozet` segmenti proje altında "Özet", günlük kayıt altında yine
 * "Özet"tir ama BAŞKA bir sayfadır ve BAŞKA bir href üretir). Düz bir
 * "pathname → etiket" eşlemesi ~90 satırlık bir kopya olurdu ve ara
 * seviyelerin href'ini üretemezdi. Ağaç, yürüyüşün doğal ürünüdür.
 *
 * ─── 🔴 `href` VARLIĞI = SAYFA VARLIĞI ────────────────────────────────────
 * Bir düğümün `href`i varsa o segmentin `page.tsx`i VARDIR ve kırıntıda
 * GÖRÜNÜR; yoksa segment YAPISALDIR (taşıyıcı klasör: `santiyeler`,
 * `bolumler`, `isveren`, `taseron`, `talep`, `talepler`) ve kırıntıda
 * BASILMAZ. Mockup da böyle çizer: `Projeler / Güneşkent Konut / A-Blok /
 * Günlük Kayıt` — `santiyeler` segmenti yoktur.
 *
 * Bu denklik bir yorum değil, ÖLÇÜLEN bir bekçidir: `trail.test.ts` ağacı
 * `src/app/(app)` dosya sistemiyle karşılaştırır (`route-tree.testkit.ts`).
 * Yeni bir `page.tsx` yazılıp ağaca eklenmezse test KIRMIZI olur — yani
 * kırıntı sessizce bayatlayamaz.
 *
 * ─── 🔴 `href` ÜRETİCİDİR, STRING DEĞİL (URL-1) ──────────────────────────
 * Her düğüm yolunu `@/lib/routes` üreticisinden alır; bu dosyada elle
 * birleştirilmiş TEK BİR yol string'i yoktur. Gerekçe `routes.ts`in kendi
 * docstring'indedir: yol biçimi değişince ATLANAN nokta SESSİZCE bozuk link
 * üretir. Kırıntı uygulamadaki EN KALABALIK link üreticisidir (her ekranda
 * 1-4 bağlantı) — tam olarak atlanmaması gereken yer burasıdır.
 */

/** Yürüyüş sırasında biriken yol parametreleri. */
export type ParamName = "projectId" | "siteId" | "sectionId" | "entityId";

/**
 * Biriken parametreler.
 *
 * 🔴 Alanlar OPSİYONEL DEĞİL, boş string ile başlar. Gerekçe: `href`
 * üreticileri böylece TAM fonksiyondur (`k.projectId!` ya da `?? ""` yazmaya
 * gerek kalmaz) ve `routes.ts`in adlandırılmış-nesne sözleşmesiyle doğrudan
 * uyuşur. Yanlış anahtarı okuyan bir üreticiyi tip sistemi değil, ağacın
 * kendi bekçisi yakalar: üretilen href sentetik yolun ÖNEKİNE eşit olmalıdır.
 */
export type RouteKeys = Readonly<Record<ParamName, string>>;

export const EMPTY_KEYS: RouteKeys = {
  projectId: "",
  siteId: "",
  sectionId: "",
  entityId: "",
};

/**
 * Adı ÖNBELLEKTEN çözülen dinamik segment türleri.
 *
 * 🔴 Bu kümenin DAR olması bir eksiklik değil, bir ÖLÇÜMDÜR (F-KIRINTI T1):
 * yalnız bu üç tür, kırıntının çalıştığı HER rotada sayfanın KENDİ sorgusuyla
 * zaten önbelleğe girer — yani ad için ikinci bir istek atılmaz (K5/B3):
 *
 *   • `project` → `useProject(projectKey)` (`["project", <key>]`).
 *     `/projeler/<p>` · `/ozet` · `/paylasim` · `/santiyeler/yeni` ·
 *     `/bolumler/**` (SectionForm) · `/sozlesmeler/isveren/<p>` — hepsi çağırır.
 *     Şantiye alt ağacında proje adı AYRI bir sorgudan değil, şantiye
 *     yanıtının `project` gövdesinden gelir (`SiteProjectSummary.name`).
 *   • `site`    → `useSite(siteKey, { project })` (`["site", <s>, <p>]`).
 *     Şantiyenin ON BİR alt ekranının hepsi bu hook'u çağırır (ölçüldü).
 *   • `section` → `useSection(sectionKey, { site, project })`.
 *
 *   • `diaryEntry` → DET-1.2 · `useSiteDiaryEntry(entryId, { sectionId })`
 *     (`siteDiaryEntryQueryKey`); etiket kaydın TARİHİDİR ("24.09.2026").
 *     Günlük kayıt detay sayfası bu sorguyu zaten atar.
 *
 * Kalan dinamik segmentler (personel/makine/fatura/hakediş/sözleşme kimlikleri)
 * ADLARINI DEĞİL, sabit ve DOĞRU bir etiket taşır ("Personel Kartı" gibi).
 * Bu bir yalan değildir: kullanıcı gerçekten o yüzeydedir. Adı basmak için
 * ikinci bir sorgu açmak K5'i ihlal ederdi.
 */
export type NamedEntity = "project" | "site" | "section" | "diaryEntry" | "offer";

export interface DynamicChild {
  /** URL segmentinin yazılacağı anahtar. */
  readonly param: ParamName;
  readonly node: TrailNode;
}

export interface TrailNode {
  /**
   * Kırıntı etiketi. Adı çözülen düğümlerde (`named`) bu metin YEDEKTİR:
   * ad henüz gelmediyse ekran iskelet basar ama ekran okuyucu bunu duyar.
   */
  readonly label?: string;
  /** Verilirse segmentin insan-okunur adı önbellekten çözülür. */
  readonly named?: NamedEntity;
  /** Segmentin KENDİ sayfası varsa `routes` üreticisi; yoksa YAPISAL segment. */
  readonly href?: (keys: RouteKeys) => string;
  /**
   * DET-1.2 · S4 — sayfası OLMAYAN (yapısal) segment yine de kırıntıda
   * görünür ve ATASININ bir görünümüne bağlanır: `bolumler/<b>/gunluk-kayit`
   * → Bölüm Detay `?sekme=gunluk-kayit`. `href` ile BİRLİKTE verilmez
   * (`href` = "bu segmentin sayfası var" iddiasıdır, bekçisi dosya sistemidir).
   * Yol kısmı adresin gerçek önekidir; yalnız sorgu dizesi ekler.
   */
  readonly crumbHref?: (keys: RouteKeys) => string;
  /**
   * DET-1.3 · adı ÇÖZÜLEMEYEN (`CrumbNames.unresolved`) bu düğüm kırıntıda
   * HİÇ basılmaz — yedek etiketine düşmez. Günlük kayıt detayı 404/403'te
   * mockup (hâl e) kırıntıyı "Günlük Kayıt"ta bırakır: tarih bilinmiyor ve
   * "Kayıt Detayı" diye bir yüzey yok (ekranda "bulunamadı" kartı var).
   * Bekleme hâli (iskelet) etkilenmez.
   */
  readonly omitWhenUnresolved?: boolean;
  readonly children?: Readonly<Record<string, TrailNode>>;
  /** Statik kardeşi eşleşmeyen segmenti yakalayan dinamik çocuk. */
  readonly dynamic?: DynamicChild;
}
