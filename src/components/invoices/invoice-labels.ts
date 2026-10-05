import type { BadgeVariant } from "@/components/ui";
import type {
  InvoiceDocumentType,
  InvoicePaymentMethod,
  InvoiceStatus,
} from "@/lib/api/hooks/useInvoices";
import type { PaymentMethodKind } from "@/lib/api/hooks/useInvoiceDetail";
import { routes } from "@/lib/routes";

/**
 * F-FAT2 · Fatura ekranlarının SAF katmanı: etiket eşlemeleri, rozet tonları,
 * kaynak künyesi ve devre-dışı gerekçeleri.
 *
 * Kanonik mockup'lar ve yorumlardaki kısaltmalar:
 *   FY  = `Fatura Yönetimi.dc.html`
 *   FK  = `Fatura - Kes.dc.html`
 *   FGI = `Fatura - Giden Detay.dc.html`
 *   FGE = `Fatura - Gelen Detay.dc.html`
 * Parantez içi sayılar O dosyaların SATIR numaralarıdır.
 *
 * Bu modülde AĞ ve DOM yoktur; testi `invoice-labels.test.ts`te yaşar.
 */

/** İzin matrisi anahtarı — fatura uçlarını `invoicing` modülü denetler. */
export const INVOICE_PERMISSION_MODULE = "invoicing";

export const INVOICES_URL = routes.invoices.list();
export const INVOICE_CREATE_URL = routes.invoices.new();

/** Detay rotası — liste satırı ve kaynak bantları bunu üretir. */
export function invoiceDetailUrl(invoiceId: string): string {
  return `${INVOICES_URL}/${invoiceId}`;
}

/**
 * FY:73 "KDV Farkı" ipucu — tutar İŞARETİNE göre değişmelidir (O5a-133):
 * `vat_difference` NEGATİF olabilir (devreden KDV, dosya yorumundaki gibi)
 * ve sıfıra KIRPILMAZ. Sabit "Ödenecek KDV" metni negatifken YALAN söyler —
 * kullanıcı borcu olmadığı hâlde ödeyecek sanır.
 */
export function vatDifferenceHint(vatDifference: string): string {
  return Number(vatDifference) < 0 ? "Devreden KDV" : "Ödenecek KDV";
}

/**
 * Gelen fatura panelinin boş-durum metni SEKMEYE göre değişmelidir
 * (O5a-130): "giden" sekmesindeyken `IncomingInvoicesTable` yalnız
 * `status: pending` süzgeçli kayıtları görür (InvoicesView.tsx incomingQuery),
 * ama "gelen" sekmesindeyken süzgeç KALKAR ve tüm gelen faturalar listelenir.
 * Boş liste iki sekmede FARKLI anlama gelir — metin başlıkla (FY panel
 * başlığı "Onay Bekleyen" ↔ "Gelen Faturalar") TUTARLI olmalı.
 */
export function incomingInvoicesEmptyMessage(tab: "giden" | "gelen"): string {
  return tab === "giden" ? "Onay bekleyen gelen fatura yok." : "Gelen fatura yok.";
}

// --- Belge tipi (FK:136-139 KAPALI kümesi BİREBİR) -----------------------

export const DOCUMENT_TYPE_LABELS: Record<InvoiceDocumentType, string> = {
  einvoice: "e-Fatura (Satış)", // FK:136
  earchive: "e-Arşiv Fatura", // FK:137
  refund: "İade Faturası", // FK:138
  withholding: "Tevkifatlı Fatura", // FK:139
};

export const DOCUMENT_TYPE_OPTIONS: readonly InvoiceDocumentType[] = [
  "einvoice",
  "earchive",
  "refund",
  "withholding",
];

// --- Ödeme şekli: İKİ AYRI ENUM, karıştırılmaz ---------------------------

/**
 * FATURANIN ödeme şekli (`InvoicePaymentMethod`, FK:145-148).
 * `credit_card` VARDIR, `promissory_note` YOKTUR.
 */
export const INVOICE_PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  transfer: "Havale / EFT", // FK:145
  cheque: "Çek", // FK:146
  cash: "Nakit", // FK:147
  credit_card: "Kredi Kartı", // FK:148
};

export const INVOICE_PAYMENT_METHOD_OPTIONS: readonly InvoicePaymentMethod[] = [
  "transfer",
  "cheque",
  "cash",
  "credit_card",
];

/**
 * ÖDEME SATIRININ şekli (`PaymentMethodKind`, FGI:225-228).
 * `promissory_note` (Senet) VARDIR, `credit_card` YOKTUR — bu yüzden yukarıdaki
 * kümeyle BİRLEŞTİRİLMEZ: tek tipte toplamak ikisinden birine olmayan bir değer
 * vaat ederdi (şema notu).
 */
export const PAYMENT_KIND_LABELS: Record<PaymentMethodKind, string> = {
  transfer: "Banka Havalesi / EFT", // FGI:225
  cheque: "Çek", // FGI:226
  promissory_note: "Senet", // FGI:227
  cash: "Nakit", // FGI:228
};

export const PAYMENT_KIND_OPTIONS: readonly PaymentMethodKind[] = [
  "transfer",
  "cheque",
  "promissory_note",
  "cash",
];

// --- Durum (§3 matrisi) --------------------------------------------------

/**
 * 🔴 K1: **"Vadeli" AYRI BİR DURUM DEĞİLDİR.** `sent` bir giden faturanın
 * `due_date`i doluysa ekran etiketi "Vadeli", boşsa "Gönderildi"dir
 * (FY:119 vs FY:130). Türetilebilen SAKLANMAZ; bu yüzden eşleme `status`
 * TEK BAŞINA değil, `due_date` ile birlikte çözülür.
 */
export const BASE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Taslak",
  sent: "Gönderildi", // FY:91
  collected: "Tahsil Edildi", // FY:130
  pending: "Onay Bekliyor", // FGE:70
  approved: "Onaylandı",
  disputed: "İtiraz Edildi",
};

export function invoiceStatusLabel(status: InvoiceStatus, dueDate: string | null): string {
  if (status === "sent" && dueDate !== null && dueDate.length > 0) return "Vadeli"; // K1
  return BASE_STATUS_LABELS[status];
}

export function invoiceStatusVariant(
  status: InvoiceStatus,
  dueDate: string | null,
): BadgeVariant {
  // Vadeli / onay bekleyen: kehribar (FY:119 `#fef3c7/#d97706` · FGE:70).
  if (status === "sent" && dueDate !== null && dueDate.length > 0) return "warning";
  if (status === "pending") return "warning";
  // Tahsil edildi / onaylandı: yeşil (FY:130 `#dcfce7/#16a34a`).
  if (status === "collected" || status === "approved") return "success";
  if (status === "disputed") return "danger";
  if (status === "sent") return "primary";
  return "neutral";
}

/**
 * FY:91 durum seçicisinin DÖRT seçeneği BİREBİR. "Vadeli" sunucuda `sent`e
 * eşlenir (K1) — bu yüzden "Gönderildi" ile AYNI sorguyu üretir ve ekran bunu
 * görünür bir notla söyler; sessizce farklıymış gibi davranmaz.
 */
export const OUTGOING_STATUS_FILTERS: readonly {
  readonly value: string;
  readonly label: string;
  readonly status: InvoiceStatus;
}[] = [
  { value: "sent", label: "Gönderildi", status: "sent" }, // FY:91
  { value: "collected", label: "Tahsil Edildi", status: "collected" }, // FY:91
  { value: "due", label: "Vadeli", status: "sent" }, // FY:91 — K1
];

export function statusForFilterValue(raw: string | null): InvoiceStatus | undefined {
  return OUTGOING_STATUS_FILTERS.find((option) => option.value === raw)?.status;
}

// --- Kaynak künyesi (FY:113 · FY:167 · FGI:102-109) ----------------------

/** `Invoice*Response`ın kaynak yabancı anahtarlarının okunabilir alt kümesi. */
export interface InvoiceSourceFields {
  progress_payment_id: string | null;
  subcontractor_progress_payment_id: string | null;
  equipment_rental_invoice_id: string | null;
  purchase_order_id: string | null;
}

export interface InvoiceSource {
  /** Kaynağın TÜRÜ — sunucudan çözülür. */
  label: string;
  /** Rotası varsa bağlantı, yoksa `null` (bağlantı UYDURULMAZ). */
  href: string | null;
  /** Rotası olmayan kaynağın görünür gerekçesi. */
  reason: string | null;
}

/**
 * FY:113 mockup'ta "Hakediş #5 →" yazar. **SIRA NUMARASI SUNUCUDAN GELMEZ**:
 * `InvoiceResponse` yalnız kaynağın KİMLİĞİNİ taşır, sıra numarasını değil —
 * uydurulmaz, çipte kaynağın TÜRÜ yazılır ve numaranın gelmediği listenin
 * altındaki bantta ADIYLA söylenir.
 */
export function invoiceSource(fields: InvoiceSourceFields): InvoiceSource | null {
  if (fields.progress_payment_id !== null) {
    return {
      label: "İşveren Hakedişi",
      href: routes.progressPayments.detail({ paymentId: fields.progress_payment_id }),
      reason: null,
    };
  }
  if (fields.subcontractor_progress_payment_id !== null) {
    return {
      label: "Taşeron Hakedişi",
      href: routes.progressPayments.subcontractor.detail({ paymentId: fields.subcontractor_progress_payment_id }),
      reason: null,
    };
  }
  if (fields.equipment_rental_invoice_id !== null) {
    // 🔴 F-KIRA: gerekçe BAYATLADI ve düştü — `/makine/kira/[invoiceId]` detay
    // ekranı bu dilimde yazıldı, kaynak artık GERÇEK bir rotaya bağlanır
    // (`progress_payment_id` dalıyla aynı biçim).
    return {
      label: "Makine Kira Faturası",
      href: routes.equipment.rentalInvoiceDetail({ invoiceId: fields.equipment_rental_invoice_id }),
      reason: null,
    };
  }
  if (fields.purchase_order_id !== null) {
    return {
      label: "Satınalma Siparişi",
      href: null,
      reason: "Sipariş detay ekranı henüz yazılmadı.",
    };
  }
  return null;
}

// --- Devre-dışı gerekçeleri (F-TH kanonu: SİLİNMEZ, gerekçesi GÖRÜNÜR) ---

/**
 * e-Fatura/GİB entegrasyonu kullanıcı kararıyla ERTELENDİ (FAT-3). Aşağıdaki
 * mockup öğelerinin hiçbirinin backend karşılığı YOKTUR; hepsi yerinde durur,
 * devre dışıdır ve gerekçesi ekranda GÖRÜNÜR.
 */
export const GIB_DISABLED_REASON = "e-Fatura/GİB entegrasyonu henüz açılmadı.";

export const REASONS = {
  /** FY:20 "GİB Bağlı ✓" rozeti · FY:23 "GİB'den Çek" · FY:106/118 "GİB" sütunu. */
  gib: GIB_DISABLED_REASON,
  /** FY:64 "e-Arşiv (12)" sekmesi — liste ucu `document_type` süzgeci SUNMAZ. */
  earchiveTab: "e-Arşiv sekmesi için belge tipi süzgeci liste ucunda yok.",
  /** FY:65 "İtiraz/İade (2)" sekmesi — içeriği hiçbir mockup'ta çizilmedi. */
  disputeTab: "İtiraz/İade sekmesinin içeriği henüz tasarlanmadı.",
  /** FY:62-65 sekme sayaçları — sekme başına sayaç ucu yok. */
  tabCounts: "Sekme sayaçları için ayrı bir sayım ucu yok; sayı YALNIZ açık sekmede sunucudan gelir.",
  /** FY:81-82 otomasyon bandı. */
  automation: "Hakediş → Fatura otomasyonu henüz açılmadı; faturalar elle kesilir.",
  /** FY:113 "#5" · FY:167 "#47" gibi kaynak SIRA NUMARALARI. */
  sourceNumber: "Kaynak evrakın sıra numarası fatura kaydında tutulmuyor; yalnız türü gösteriliyor.",
  /** FY:157/170 "Eşleşme"/"✓ Eşleşti" durumu — generik faturada böyle bir alan yok. */
  matchState: "Sipariş/hakediş eşleşme durumu fatura kaydında tutulmuyor.",
  /** FK:70-72 "Siparişten" kaynak kartı. */
  fromOrder: "Siparişten fatura doldurma ucu henüz açılmadı.",
  /** FK:163 "Hakediş #5'ten yüklendi" — otomatik kalem doldurma ucu yok. */
  autoFill: "Hakedişten kalem otomatik doldurma ucu yok; kalemleri elle girin.",
  /**
   * FK:225/231/237 · FK:246-250 tutar önizlemesi.
   *
   * Önizleme `invoice-amount-preview.ts` ile HESAPLANIR (kaynak: backend
   * `invoicing/amounts.py`), ama OTORİTE DEĞİLDİR: kaydedilen tutarları sunucu
   * kendi hesabıyla yazar. Bu cümle ekranda görünür — kullanıcı baktığı sayının
   * ne olduğunu bilmelidir.
   */
  previewOnly:
    "Tutarlar ÖNİZLEMEDİR; kaydedilen değerleri sunucu hesaplar ve detay ekranında görünür.",
  /** FK:253 · FGE:197-241 muhasebe/yevmiye. */
  accounting: "Muhasebe (yevmiye) kaydı bu dilimde üretilmiyor.",
  /** FGI:24 "PDF İndir" · FGI:25 "XML". */
  export: "Fatura PDF/XML dışa aktarma ucu henüz açılmadı.",
  /** FGI:63 "UUID: …" · FGI:206 "Zarf No". */
  gibIdentifiers: "e-Fatura UUID ve zarf numarası kayıtta tutulmuyor.",
  /** FGI:193-217 "GİB İşlem Geçmişi" zaman çizelgesi. */
  gibTimeline: "GİB işlem geçmişi kaydı tutulmuyor.",
  /** FGI:97 "Para Birimi". */
  currency: "Fatura kaydında para birimi alanı yok; tüm tutarlar TRY'dir.",
  /** FGE:60 "Firmayla İletişim". */
  contact: "Firmayla iletişim akışı henüz tasarlanmadı.",
  /** FGE:140 "Kısmi Onayla". */
  partialApprove: "Kısmi onay ucu açılmadı; onay faturanın tamamı içindir.",
} as const;

// --- Dönem penceresi (FY:90 "Giden Faturalar — Temmuz 2026") -------------

export interface MonthRange {
  from: string;
  to: string;
  year: number;
  /** 1-12. */
  month: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * FY:90 başlığı bir AY yazar ve tablonun satırları o aya aittir → liste
 * sorgusu da o aya süzülür (`date_from`/`date_to`). Başlığı ay yazıp listeyi
 * süzmemek, başlığın YALAN söylemesi olurdu.
 *
 * 🔴 YEREL TAKVİM: gün/ay `today.getFullYear()/getMonth()/getDate()` ile
 * okunur, `toISOString()` İLE DEĞİL — o UTC'ye çevirir ve TR saatinde ayın ilk
 * gününü bir önceki aya kaydırırdı (üretimde aynı sınıf hata bulundu).
 */
export function monthRangeOf(today: Date): MonthRange {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  // `new Date(year, month, 0)` = önceki ayın son günü = bu ayın gün sayısı.
  const lastDay = new Date(year, month, 0).getDate();
  return {
    year,
    month,
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}
