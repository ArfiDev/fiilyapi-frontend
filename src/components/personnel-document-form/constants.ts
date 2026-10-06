import { routes } from "@/lib/routes";
/**
 * Personel belge formunun metin/seçenek envanteri (F-BLG T2c).
 *
 * Kanon: `Form - Personel Belgesi.dc.html` (PB). Yorumlardaki sayılar O
 * DOSYANIN satır numaralarıdır.
 *
 * ⚠️ ONAYLI SAPMA S-FRM: mockup'ın üst şeridi + breadcrumb (41-54) ve sol
 * menüsü (57-71) tasarım kütüphanesinin HARNESS'ıdır, ürün kabuğu değildir
 * ("Form Kütüphanesi" öğesi yalnız bu form dosyalarında var) — form Personel
 * Detay ekranının üzerinde DİYALOG olarak açılır, yeni rota AÇILMAZ.
 * Gövde/alan/etiket/ölçü BİREBİR kalır.
 */

/**
 * Korkuluklar — sözleşmenin AYNASI (`form-limits.contract.test.ts` iki yönlü kapı).
 *
 * 🔴 `freeLabel` bu dilimde ÖLÇÜLEREK eklendi: kullanıcının yazdığı ve gövdeye
 * `free_label` olarak giden alanın korkuluğu HİÇ YOKTU (sözleşme 150) —
 * 151. karakterde sessiz 422. `note` ise sözleşmede sınır İLAN ETMEZ, 2000
 * istemcinin kendi tavanıdır (mockup 169 "Maks 2000 karakter").
 */
export const MAX_LENGTH = {
  note: 2000,
  freeLabel: 150,
} as const;

/** Boş (seçilmemiş) seçenek değeri. */
export const EMPTY_OPTION_VALUE = "";

/**
 * 135 · Belge Türü seçicisinin SON seçeneği. Katalog tipleri UUID taşıdığı
 * için bu nöbetçi değer onlarla ÇAKIŞAMAZ. Seçilince `free_label` açılır ve
 * gövdeye `type_id` DEĞİL `free_label` konur (XOR).
 */
export const OTHER_TYPE_VALUE = "__other__";

export const PERSONNEL_DOCUMENT_TEXT = {
  title: "Personel Belgesi Ekle", // 75
  subtitle: "Sağlık raporu, İSG eğitimi, sertifika gibi personel belgelerini kaydet", // 76
  documentCountSuffix: "belge kayıtlı", // 85
  fileCard: "📎 Dosya", // 90
  /** Kart başlığı emojiyi taşır; alan etiketi erişilebilir ad olarak sade kalır. */
  file: "Dosya", // 90
  // M5_3 #172 — mockup'ın niyeti "PDF veya fotoğraf" (dropHint aynı cümleyi
  // taşır); ham `image/*` bunu YANLIŞ uygular: gif/webp/bmp/tiff gibi backend
  // beyaz listesinde (config.py `allowed_document_extensions`) OLMAYAN
  // resim tipleri seçilebilir olur (seçilince 415/422 ile geri döner), oysa
  // whitelist'teki docx/xlsx/csv/dwg/zip seçiciden GİZLENİR. `document-form`
  // kardeşiyle (constants.ts:33) AYNI desen: uzantı bazlı, yalnız "PDF veya
  // fotoğraf" kapsamı — mockup'ın metnini DEĞİŞTİRMEZ, `accept`i backend'in
  // GERÇEKTEN kabul ettiği resim uzantılarına indirger.
  fileAccept: ".pdf,.jpg,.jpeg,.png,.heic", // 98
  twoStepNote:
    "Yüklediğiniz dosya önce genel arşive kaydedilir, ardından bu personel kaydına bağlanır. Dosya zaten arşivde varsa yüklemek yerine seçebilirsiniz.", // 92-95
  dropTitle: "Belgeyi buraya sürükleyin veya tıklayın", // 100
  dropHint: "PDF veya fotoğraf · Maks 20 MB", // 101
  orSeparator: "veya", // 105
  archivePick: "Arşivden Mevcut Belge Seç", // 109
  archivePickEmptyOption: "— Arşivden belge seçin", // 111
  archivePickHint: "Belge Arşivi'nde bu personel adına kayıtlı dosyalar listelenir", // 116
  infoCard: "📋 Belge Bilgileri", // 122
  type: "Belge Türü", // 125
  typePlaceholderOption: "Tür seçiniz...", // 127
  otherTypeOption: "Diğer…", // 135
  typeHint: 'Listede yoksa "Diğer…" seçip serbest etiket yazın', // 137
  freeLabel: "Serbest Etiket", // 140
  freeLabelPlaceholder: "Tür listesinde yoksa buraya yazın", // 141
  freeLabelHint: 'Yalnızca "Diğer…" seçildiğinde aktif olur', // 142
  issuedAt: "Düzenlenme Tarihi", // 145
  validUntil: "Geçerlilik Bitiş Tarihi", // 149
  validUntilHint: "Boş bırakılırsa süre takibi yapılmaz", // 151
  ohsWarningTitle: "İSG mevzuatı uyarısı:", // 158
  ohsWarningBody:
    "Sağlık raporu ve İSG eğitimi süresi dolan personel sahada çalışamaz. Bitiş tarihi girilirse sistem 30 gün önceden İK'ya ve personele bildirim gönderir.", // 158-159
  ohsWarningLink: "Belge Takibi →", // 160
  noteCard: "📝 Not", // 167
  /** Kart başlığı emojiyi taşır; alan etiketi erişilebilir ad olarak sade kalır. */
  note: "Not", // 167
  notePlaceholder: "Belgeyi düzenleyen kurum, yenileme prosedürü, özel durumlar...", // 168
  noteHint: "Maks 2000 karakter", // 169
  cancel: "İptal", // 173
  submit: "Belgeyi Kaydet", // 174
} as const;

/**
 * 160 · "Belge Takibi →" hedefi. Rota REPODA VARDIR (F-İK T5 açtı:
 * `src/app/(app)/personel/belgeler/page.tsx`) — bağlantı GERÇEKTİR.
 */
export const HR_DOCUMENTS_ROUTE = routes.personnel.documents();

/**
 * 🔴 108-117 · "Arşivden Mevcut Belge Seç" — KARŞILANAMAZ.
 * `GET /documents` `project_id`yi ZORUNLU ister ve PERSONEL süzgeci YOKTUR;
 * mockup'ın "bu personel adına kayıtlı dosyalar listelenir" (116) vaadi
 * bugünkü API ile karşılanamaz. Öğe SİLİNMEZ (F-TH kanonu): seçici devre-dışı
 * basılır, mockup'ın kendi hint'i korunur ve gerekçe GÖRÜNÜR durur.
 * DOSYA YÜKLEME YOLU ÇALIŞIR kalır.
 */
export const ARCHIVE_PICK_REASON =
  "Arşivden seçme kapalı: belge arşivi listesi proje kapsamında çalışıyor ve personele göre süzülemiyor — bu personelin dosyalarını listeleyecek bir uç yok. Dosyayı yükleme alanından ekleyin.";

/**
 * 🔴 Yükleme, personelin ATANMIŞ PROJESİ yoksa yapılamaz: `POST /documents`
 * `project_id` alanını ZORUNLU ister, `PersonnelResponse.assigned_project_id`
 * ise nullable'dır. Sessiz atlama YOK — dosya seçildiğinde form durur ve bu
 * gerekçeyi basar. Dosyasız belge takibi meşrudur (şema `document_id`
 * opsiyonel), o yüzden dosya kaldırılırsa kayıt yine açılabilir.
 */
export const NO_PROJECT_UPLOAD_REASON =
  "Personelin projesi yok ya da görme yetkiniz dışında; dosya arşive yüklenemiyor.";

/** Belge tipi kataloğu boşsa/yüklenemezse basılan görünür gerekçe. */
export const TYPE_CATALOG_ERROR_MESSAGE =
  "Belge türü kataloğu yüklenemedi; tür seçilemiyor. \"Diğer…\" ile serbest etiket yazarak devam edebilirsiniz.";

/**
 * İKİ ADIMLI akışın İKİNCİ adımı düşerse arşivde ÖKSÜZ belge kalır. Sessizce
 * yutulmaz: kullanıcı dosyanın arşivde durduğunu ve tekrar denemenin ikinci
 * kopya ÜRETMEYECEĞİNİ görür (yüklenen künye durumda tutulur).
 *
 * ⚠️ Geri alma (`DELETE /documents/{id}`) BİLEREK çağrılmaz: repo kalıcı
 * kararı silme hook'u yazmamaktır (`useDocumentMutations.ts` notu) ve silme
 * ayrı bir izin ister — kullanıcının silme yetkisi olmayabilir; sessiz bir
 * silme denemesi ikinci bir gizli hata sınıfı doğururdu. Dosya arşivde
 * GÖRÜNÜR kalır, kullanıcı kararı verir.
 */
export function buildOrphanFileMessage(fileName: string, detail: string): string {
  return `Dosya (${fileName}) arşive YÜKLENDİ ama personel kaydına bağlanamadı: ${detail} Dosya Belge Arşivi'nde duruyor; tekrar kaydettiğinizde aynı dosya kullanılır, ikinci kopya oluşmaz.`;
}
