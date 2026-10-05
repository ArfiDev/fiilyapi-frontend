import type { BadgeVariant } from "@/components/ui";
import {
  CartIcon,
  CheckCircleIcon,
  FileTextIcon,
  InboxIcon,
  ScalesIcon,
  UserIcon,
  BuildingIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { purchaseRequestQuotesHref } from "@/components/purchasing/purchasing-labels";
import type {
  ApprovalDocumentType,
  ApprovalHistoryDecision,
  ApprovalHistoryFilter,
  ApprovalRole,
  ApprovalStepRead,
} from "@/lib/api/hooks/useApprovals";
import { formatCurrencyTight, formatDateTimeDots, formatPeriodLabel } from "@/lib/format";
import { routes } from "@/lib/routes";

/**
 * F-OK T5 · Onay Kutusu SAF katmanı — kanon `projedesign/Onay Kutusu.dc.html`
 * (yorumlardaki `:NN` O dosyanın SATIR numaralarıdır).
 *
 * 🔴 KANON E: sunucu KARAR ALANI DÖNDÜRMEZ (`can_approve` yok, `status` yok,
 * aciliyet/renk yok). Adım durumu `decided_at` + `current_step_no` +
 * `can_decide` üçlüsünden TÜRETİLİR ve türetme TEK yardımcıda yaşar.
 * (IZN-B3b: `my_approval_roles` KALKTI — "sıradaki adım benim mi" sorusunun
 * cevabı kalem başına `can_decide`dir.)
 */

/** Karşılığı olmayan alanın basılacağı işaret (`—`, U+2014 — fontta KAPSANIR). */
export const UNKNOWN_VALUE = "—";

/**
 * Adım rolü ETİKETLERİ. `ApprovalRole` sistem rolü DEĞİL, zincirin ADIM
 * rolüdür; metinler mockup'ın rol akışı şeridinden (`:47` `:52` `:57` `:62`)
 * ve adım şeritlerinden (`:129-135` `:164-170`) birebir alınır.
 *
 * ⚠️ Mockup KENDİ İÇİNDE tutarsızdır: `:131` "Proje Müdürü" yazarken `:166`
 * aynı rolü "PM" diye kısaltır. Uzun ad kazandı — akış şeridi (`:52`) ve
 * kartların çoğunluğu onu kullanıyor, ayrıca aynı rolün iki kartta iki farklı
 * adla görünmesi kullanıcıya açıklanamaz.
 */
export const APPROVAL_ROLE_LABELS: Record<ApprovalRole, string> = {
  site_chief: "Şantiye Şefi",
  project_manager: "Proje Müdürü",
  accounting: "Muhasebe",
  patron: "Patron",
  procurement: "Satınalma",
};

/** Sözlükte olmayan (ileride eklenecek) rol anahtarı ham basılır, ÇÖKMEZ. */
export function approvalRoleLabel(role: string): string {
  return APPROVAL_ROLE_LABELS[role as ApprovalRole] ?? role;
}

/* --- Adım şeridi: DÖRT durum (`:129-135` `:164-170` `:222-224`) ---------- */

export type ApprovalStepState =
  /** `:130` `✓ {rol}` yeşil — karar verilmiş. */
  | "decided"
  /** `:170` `● {rol} (Siz)` koyu mavi/beyaz — sıradaki adım BANA düştü. */
  | "current-mine"
  /** `:133` `● {rol} (bekliyor)` açık mavi — sıradaki adım BAŞKASININ. */
  | "current-other"
  /** `:135` `○ {rol}` gri — henüz sırası gelmemiş adım. */
  | "upcoming";

export interface ApprovalStepStateInput {
  step: ApprovalStepRead;
  currentStepNo: number;
  /** Kalemin `can_decide`ı: true ise SIRADAKİ adımın sahibi benim. */
  canDecide: boolean;
}

/**
 * 🔴 TEK TÜRETME NOKTASI. Sıralama önemlidir: karar verilmiş bir adım, sıra
 * numarası ne olursa olsun ÖNCE yeşile düşer — `decided_at` bir OLGUdur,
 * `current_step_no` ise imlecin nerede durduğudur.
 *
 * ⚠️ `current-other` bu ekranda ULAŞILAMAZDIR ve bu BİLİNÇLİDİR: `GET
 * /approvals` yalnız "kullanıcıya DÜŞEN sıradaki adımları" döndürür, yani
 * listedeki her kalemin sıradaki adımı zaten benimdir. Dal SİLİNMEZ çünkü
 * türetme TOTAL olmalıdır (mockup `:132` o hâli `Tümü` sekmesi bağlamında
 * çizer) ve o sekme etkinleştiğinde yardımcı hazır olacaktır. Ulaşılamaz dal
 * BİRİM TESTİYLE doğrulanır, kadrajla/e2e ile DEĞİL.
 *
 * Son dal ("geçmiş ama kararsız" gibi sunucunun üretmemesi gereken hâller
 * dahil) gri `upcoming`e düşer: sessiz atlama ya da çökme YOK.
 */
export function approvalStepState({
  step,
  currentStepNo,
  canDecide,
}: ApprovalStepStateInput): ApprovalStepState {
  if (step.decided_at !== null) return "decided";
  if (step.step_no === currentStepNo) {
    return canDecide ? "current-mine" : "current-other";
  }
  return "upcoming";
}

/** `:135` `(Siz)` / `:133` `(bekliyor)` — yalnız iki durumda ek not vardır. */
export function approvalStepNote(state: ApprovalStepState): string | null {
  if (state === "current-mine") return "(Siz)";
  if (state === "current-other") return "(bekliyor)";
  return null;
}

/* --- Evrak tipi künyesi (`:118-148` `:151-179` `:209-238`) --------------- */

export type ApprovalIcon = typeof FileTextIcon;

export interface ApprovalDocumentPresentation {
  /** Tip rozeti metni — `:123` `:157` `:216`. */
  badgeLabel: string;
  badgeVariant: BadgeVariant;
  /** Varyantın karşılamadığı ton için dilim-yerel sınıf (`ui/` DEĞİŞTİRİLMEZ). */
  badgeClassName: string;
  /** Sol ikon kutusu — `:120` 📋 · `:153` 🛒 · `:211` 💼 (glif yasağı: SVG). */
  Icon: ApprovalIcon;
  iconClassName: string;
  /** `:138` "Brüt" · `:173` "Sipariş Tutarı" · `:227` "Hakediş Tutarı". */
  grossLabel: string;
  /** `:139` "Net" · `:228` "Net Tahsil". Satınalmada kutu YOKTUR (`null`). */
  netLabel: string | null;
  /** "Onayla" düğmesi — `:143` yeşil · `:178` mavi · `:233` mor. */
  approveClassName: string;
}

/**
 * 🔴 Tip listesi EKRANDA SABİTLENMEZ, `document_type`tan gelir. `Record<…>`
 * seçildi ki enuma yeni bir üye eklendiğinde DERLEME ANINDA kırılsın; render
 * yolunda ayrıca bir düşüş dalı vardır (`approvalDocumentPresentation`).
 *
 * 🔴 Bordro/Günlük Kayıt kartı (`:182-206`) BASILMAZ: `ApprovalDocumentType`
 * o aileleri TAŞIMAZ (OK-1B işi, ayrıca izin talebi/bordro satırı zincire hiç
 * girmez — şema docstring'i).
 */
export const APPROVAL_DOCUMENT_PRESENTATION: Record<
  ApprovalDocumentType,
  ApprovalDocumentPresentation
> = {
  subcontractor_progress_payment: {
    badgeLabel: "HAKEDİŞ",
    badgeVariant: "warning",
    badgeClassName: "ok-badge--hakedis",
    Icon: FileTextIcon,
    iconClassName: "ok-card__icon--hakedis",
    grossLabel: "Brüt",
    netLabel: "Net",
    approveClassName: "ok-btn--approve-success",
  },
  purchase_request: {
    badgeLabel: "SATIN ALMA",
    badgeVariant: "primary",
    badgeClassName: "ok-badge--satinalma",
    Icon: CartIcon,
    iconClassName: "ok-card__icon--satinalma",
    grossLabel: "Sipariş Tutarı",
    // 🔴 Satınalmada `net_amount` HER ZAMAN `null`dur — talebin brüt/net
    // ayrımı yoktur (mockup `:173` TEK kutu).
    netLabel: null,
    approveClassName: "ok-btn--approve-primary",
  },
  progress_payment: {
    badgeLabel: "İŞVEREN HAKEDİŞ",
    badgeVariant: "neutral",
    badgeClassName: "ok-badge--isveren",
    Icon: WalletIcon,
    iconClassName: "ok-card__icon--isveren",
    grossLabel: "Hakediş Tutarı",
    netLabel: "Net Tahsil",
    approveClassName: "ok-btn--approve-purple",
  },
};

/**
 * BİLİNMEYEN TİP → ZARİF DÜŞÜŞ: rozet HAM DEĞERLE basılır, nötr ikon kullanılır
 * ve kart ÇÖKMEZ. Sessiz atlama YOKTUR — kullanıcı tanımadığımız bir evrağın
 * imzasını kaybetmemelidir.
 */
export function approvalDocumentPresentation(
  documentType: string,
): ApprovalDocumentPresentation {
  return (
    APPROVAL_DOCUMENT_PRESENTATION[documentType as ApprovalDocumentType] ?? {
      badgeLabel: documentType,
      badgeVariant: "neutral",
      badgeClassName: "ok-badge--bilinmeyen",
      Icon: InboxIcon,
      iconClassName: "ok-card__icon--bilinmeyen",
      grossLabel: "Tutar",
      netLabel: null,
      approveClassName: "ok-btn--approve-primary",
    }
  );
}

/**
 * 🔴 ONAY/RET UÇLARI TİPE GÖRE AYRIŞTIĞI İÇİN bilinmeyen bir tipin uçları da
 * BİLİNMEZ. Böyle bir kalemde "Onayla"/"Reddet" düğmeleri DEVRE DIŞI basılır
 * (gerekçesi görünür) — aksi hâlde tıklama sessizce hiçbir istek üretmeyen bir
 * "başarı"ya düşerdi. Kart yine de basılır: kullanıcı imzasının varlığını
 * görmelidir.
 */
export function isKnownApprovalDocumentType(
  documentType: string,
): documentType is ApprovalDocumentType {
  return Object.prototype.hasOwnProperty.call(APPROVAL_DOCUMENT_PRESENTATION, documentType);
}

export const APPROVAL_UNKNOWN_TYPE_REASON =
  "Bu evrak tipinin onay/ret ucu bu ekranda tanımlı değil.";

/* --- "Detay" hedefi (`:145` `:180` `:235`) ------------------------------- */

export interface ApprovalDetailTarget {
  /** Düğme/bağlantı etiketi — mockup `:145` "Detay". */
  label: string;
  /** Rotası varsa hedef, yoksa `null` — bağlantı UYDURULMAZ. */
  href: string | null;
  /** Rotası olmayan hedefin GÖRÜNÜR gerekçesi. */
  reason: string | null;
}

export const APPROVAL_DETAIL_LABEL = "Detay";

/**
 * `invoiceSource` deseninin (`invoices/invoice-labels.ts`) birebir kardeşi:
 * `{ label, href, reason }`. Rota BU DİLİMDE AÇILMAZ — talebin detay ekranı
 * henüz yazılmamıştır (`/satinalma/talepler/{id}` YOK, yalnız
 * `/satinalma/talepler/{id}/teklifler` var) ve F-TH kanonu gereği rotası
 * olmayan mockup öğesi SİLİNMEZ, devre-dışı + gerekçeli basılır.
 */
export function approvalDetailTarget(
  documentType: string,
  documentId: string,
): ApprovalDetailTarget {
  // 🔴 KİMLİK BURADA KODLANMAZ — `routes.*` üreticisi her segmenti kendisi
  // `encodeURIComponent`ten geçirir. Önceden burada bir ön kodlama vardı ve
  // göç sırasında ÇİFT KODLAMA üretti (`a/b` → `a%252Fb`); testteki elle
  // yazılmış beklenti yakaladı.
  const id = documentId;
  switch (documentType) {
    case "progress_payment":
      return { label: APPROVAL_DETAIL_LABEL, href: routes.progressPayments.detail({ paymentId: id }), reason: null };
    case "subcontractor_progress_payment":
      return { label: APPROVAL_DETAIL_LABEL, href: routes.progressPayments.subcontractor.detail({ paymentId: id }), reason: null };
    case "purchase_request":
      return {
        label: APPROVAL_DETAIL_LABEL,
        href: null,
        reason: "Satın alma talebinin detay ekranı henüz yazılmadı.",
      };
    default:
      return {
        label: APPROVAL_DETAIL_LABEL,
        href: null,
        reason: "Bu evrak tipinin detay ekranı tanımlı değil.",
      };
  }
}

/* --- Bağlantı çipi (`:174` `:229`) --------------------------------------- */

export interface ApprovalLinkChip {
  label: string;
  href: string;
}

/**
 * `:174` mockup'ta "3 Teklif Karşılaştırması →" + alt satır "En uygun: KarTaş
 * ₺592K" yazar. 🔴 TEKLİF SAYISI da EN UYGUN TEDARİKÇİ/TUTAR da yanıtta YOKTUR
 * (`ApprovalInboxItem` onları taşımaz) — sayı UYDURULMAZ, alt satır BASILMAZ.
 * Çip etiketi sayısız hâline düşer. Hedef rota `purchasing-labels.ts`ten gelir,
 * elle yazılmaz.
 *
 * `:229` "Hakediş Detayı →" işveren hakedişinin DETAY hedefiyle aynı yere gider.
 * Taşeron hakediş kartında (`:137-141`) çip YOKTUR.
 */
export function approvalLinkChip(
  documentType: string,
  documentId: string,
): ApprovalLinkChip | null {
  switch (documentType) {
    case "purchase_request":
      return { label: "Teklif Karşılaştırması", href: purchaseRequestQuotesHref(documentId) };
    case "progress_payment":
      return { label: "Hakediş Detayı", href: routes.progressPayments.detail({ paymentId: documentId }) };
    default:
      return null;
  }
}

/* --- Eşik rozeti (`:158`) ------------------------------------------------ */

/**
 * Rozet YALNIZ zincirde `patron` adımı VARSA basılır: eşiği aşan kalem
 * patrona kadar çıkar. Türetme `steps`ten yapılır, tutar karşılaştırmasından
 * DEĞİL — eşik/tutar kararını sunucu zaten zinciri kurarken vermiştir.
 */
export function approvalNeedsPatron(steps: readonly ApprovalStepRead[]): boolean {
  return steps.some((step) => step.approval_role === "patron");
}

/**
 * `:158` `&gt;₺500K — Patron Gerekli`. 🔴 EŞİK KALEMİN KENDİ DONMUŞ EŞİĞİDİR
 * (`threshold_snapshot`), ayardan okunmaz: ayar sonradan değişse bile bu kalem
 * o günkü eşikle zincire girmiştir.
 *
 * ⚠️ ONAYLI SAPMA: mockup `500K` kısaltmasını çizer ama KEYFİ bir eşiği
 * "K/M" ile kısaltacak şema mockup'tan ÖLÇÜLEMEZ (yuvarlama kuralı yok) →
 * tam biçim basılır (`formatCurrencyTight` — `₺` bitişik, mockup'la aynı).
 */
export function approvalThresholdBadgeLabel(thresholdSnapshot: string): string {
  return `>${formatCurrencyTight(thresholdSnapshot)} — Patron Gerekli`;
}

/* --- Alt başlık dönem Türkçeleştirmesi (`:127` `:220`) ------------------- */

/**
 * Backend dönemi alt başlığa `MM/YYYY` olarak GÖMER (yapılandırılmış alan
 * YOK); mockup ise "Temmuz 2026" gösterir. Alt başlık `" · "` ile ayrılmış
 * parçalara bölünür ve YALNIZ kalıba uyan parça çevrilir — geri kalan metne
 * dokunulmaz.
 */
export const APPROVAL_SUBTITLE_SEPARATOR = " · ";

export function approvalSubtitleLabel(subtitle: string | null): string | null {
  if (subtitle === null) return null;
  return subtitle
    .split(APPROVAL_SUBTITLE_SEPARATOR)
    .map((part) => formatPeriodLabel(part))
    .join(APPROVAL_SUBTITLE_SEPARATOR);
}

/* --- Tutar kutuları ------------------------------------------------------ */

/**
 * 🔴 `gross_amount` `null` OLABİLİR (fiyatsız kalem) — `0` basmak "eksik veri"
 * ile "sıfır tutar"ı ayırt edilemez kılardı (SA/NULL-EŞİK kanonu). `—` basılır.
 */
export function approvalAmountLabel(amount: string | null): string {
  return amount === null ? UNKNOWN_VALUE : formatCurrencyTight(amount);
}

/* --- Sekme şeridi (`:71-76`) --------------------------------------------- */

export type ApprovalTabKey = "tumu" | "benim" | "onaylanan" | "reddedilen";

export interface ApprovalTabDef {
  key: ApprovalTabKey;
  label: string;
  /**
   * Sekmenin veri kaynağı: `null` = bekleyen kutusu (`GET /approvals`), aksi
   * hâlde `GET /approvals/history?decision=` süzgeci.
   */
  historyFilter: ApprovalHistoryFilter | null;
  /** Sekmeye özgü boş durum metni. */
  emptyMessage: string;
}

/**
 * OKT-F1.2 (KARARLAR 62ae58a, onaylı sapma): DÖRT sekmenin DÖRDÜ de çalışır.
 * Mockup'taki `(7)`/`(12)`/`(2)` rakamları ÇİZİM VERİSİDİR — sayı yalnız o
 * sekmenin sorgusu yüklendiyse sunucunun `total`inden basılır.
 *
 * Sıra mockup'tan (`:72-75`) korunur — "Tümü" başta durur.
 */
export const APPROVAL_TABS: readonly ApprovalTabDef[] = [
  { key: "tumu", label: "Tümü", historyFilter: "all", emptyMessage: "Görünür onay zinciri yok" },
  { key: "benim", label: "Benim Onayım", historyFilter: null, emptyMessage: "Onayınızı bekleyen kalem yok." },
  {
    key: "onaylanan",
    label: "Onay Verildi",
    historyFilter: "approved",
    emptyMessage: "Onayladığınız evrak yok",
  },
  {
    key: "reddedilen",
    label: "Reddedildi",
    historyFilter: "rejected",
    emptyMessage: "Reddedilen evrak yok",
  },
];

/** Parametresiz (ya da tanınmayan) `?sekme=` bu sekmeye düşer — `:73`. */
export const APPROVAL_DEFAULT_TAB_KEY: ApprovalTabKey = "benim";

/** `?sekme=` değerini sekmeye çevirir; bilinmeyen/boş değer varsayılana düşer. */
export function parseApprovalTab(value: string | null): ApprovalTabDef {
  return (
    APPROVAL_TABS.find((tab) => tab.key === value) ??
    APPROVAL_TABS.find((tab) => tab.key === APPROVAL_DEFAULT_TAB_KEY)!
  );
}

export function approvalTabLabel(tab: ApprovalTabDef, total: number | undefined): string {
  return total === undefined ? tab.label : `${tab.label} (${total})`;
}

/* --- Geçmiş kartı rozeti ------------------------------------------------- */

export interface ApprovalDecisionBadge {
  variant: BadgeVariant;
  label: string;
}

/** `decision` → rozet; `pending` (yalnız Tümü) nötr `Bekliyor · N. adım`. */
export function approvalDecisionBadge(
  decision: ApprovalHistoryDecision,
  currentStepNo: number,
): ApprovalDecisionBadge {
  switch (decision) {
    case "approved":
      return { variant: "success", label: "Onaylandı" };
    case "rejected":
      return { variant: "danger", label: "Reddedildi" };
    case "pending":
      return { variant: "neutral", label: `Bekliyor · ${currentStepNo}. adım` };
  }
}

/** `Karar: {ad} · gg.aa.yyyy ss:dd` — karar veren yoksa `Karar: —`. */
export function approvalDecisionLine(decidedBy: string | null, decidedAt: string | null): string {
  const who = decidedBy ?? UNKNOWN_VALUE;
  return decidedAt === null ? `Karar: ${who}` : `Karar: ${who} · ${formatDateTimeDots(decidedAt)}`;
}

export function approvalReasonLine(reason: string | null): string | null {
  return reason === null ? null : `Gerekçe: ${reason}`;
}

/* --- Rol akışı şeridi (`:42-68`) ----------------------------------------- */

export interface ApprovalFlowRole {
  title: string;
  description: string;
  Icon: ApprovalIcon;
  /** `:60-63` Patron kartı vurguludur (mavi zemin, beyaz metin). */
  isHighlighted?: boolean;
}

/**
 * 🔴 `CHAIN_DEFINITIONS` backend KODUNDADIR, hiçbir uçtan yayınlanmaz → bu
 * dört kartın metni mockup'tan BİREBİR alınır, uçtan türetilmez. Emoji
 * (👷 🏗 📒 👔) `fonts.css`in 63 aralık parçasında KAPSANMADIĞI için `ui/icons`
 * karşılıklarıyla basılır (glif yasağı).
 */
export const APPROVAL_FLOW_TITLE = "Rol Bazlı Onay Akışı";

/** `:62` patron kartının eşiksiz gövdesi — eşik ayrıca eklenir. */
export const APPROVAL_PATRON_BASE_DESCRIPTION = "Final onay";

export const APPROVAL_FLOW_ROLES: readonly ApprovalFlowRole[] = [
  {
    title: APPROVAL_ROLE_LABELS.site_chief,
    description: "Günlük kayıt, hakediş talebi oluşturur",
    Icon: UserIcon,
  },
  {
    title: APPROVAL_ROLE_LABELS.project_manager,
    description: "Teknik kontrol, ön onay",
    Icon: BuildingIcon,
  },
  {
    title: APPROVAL_ROLE_LABELS.accounting,
    description: "Mali kontrol, tutar doğrulama",
    Icon: ScalesIcon,
  },
  {
    title: APPROVAL_ROLE_LABELS.patron,
    description: APPROVAL_PATRON_BASE_DESCRIPTION,
    Icon: CheckCircleIcon,
    isHighlighted: true,
  },
];

/**
 * `:62` "Final onay &gt; ₺500K". 🔴 EŞİK SABİT YAZILMAZ — `GET
 * /approvals/settings`ten gelir. Ayar yüklenmediyse/hata ise EŞİK PARÇASI
 * DÜŞER (kart yine basılır, sahte sayı BASILMAZ).
 */
export function approvalPatronDescription(threshold: string | undefined): string {
  if (threshold === undefined) return APPROVAL_PATRON_BASE_DESCRIPTION;
  return `${APPROVAL_PATRON_BASE_DESCRIPTION} > ${formatCurrencyTight(threshold)}`;
}

/**
 * `:65` sağa yaslı pill: "₺500K altı → PM + Muhasebe yeterli". Eşik
 * bilinmiyorsa pill HİÇ BASILMAZ (`null`) — eşiksiz cümle anlamsızdır.
 *
 * `→` (U+2192) `fonts.css`te KAPSANMIYOR → düz sözcük kullanılır (glif yasağı).
 */
export function approvalBelowThresholdLabel(threshold: string | undefined): string | null {
  if (threshold === undefined) return null;
  return `${formatCurrencyTight(threshold)} altı için PM + Muhasebe yeterli`;
}

/* --- Devre-dışı üst aksiyon (`:32`) -------------------------------------- */

export const APPROVAL_BULK_LABEL = "Tümünü Onayla";
export const APPROVAL_BULK_DISABLED_REASON =
  "Toplu onay henüz desteklenmiyor; her kalem kendi kartından onaylanır.";

/* --- Ret diyaloğu -------------------------------------------------------- */

export const APPROVAL_REJECT_TITLE = "Onayı Reddet";
export const APPROVAL_REJECT_SUBMIT_LABEL = "Reddet";
export const APPROVAL_REJECT_CANCEL_LABEL = "Vazgeç";
export const APPROVAL_REJECT_REASON_LABEL = "Gerekçe";
export const APPROVAL_REJECT_REASON_REQUIRED = "Gerekçe zorunlu";
export const APPROVAL_REJECT_REASON_HINT =
  "Gerekçe evrağı hazırlayan kişiye gider; neyin düzeltileceğini yazın.";
export const APPROVAL_REJECT_ERROR_FALLBACK = "Reddedilemedi.";
export const APPROVAL_APPROVE_ERROR_FALLBACK = "Onaylanamadı.";
export const APPROVAL_APPROVE_LABEL = "Onayla";
export const APPROVAL_REJECT_LABEL = "Reddet";

/**
 * 🔴 Sunucu `reason`ı `strip()` SONRASI boş bulursa 422 döner — kapı da
 * `trim()` üzerinden kurulur, `!== ""` üzerinden DEĞİL: tek boşluk öyle bir
 * kapıyı geçer ve kullanıcı yalnız "Reddedilemedi." görürdü.
 */
export function isApprovalRejectReasonReady(reason: string): boolean {
  return reason.trim().length > 0;
}
