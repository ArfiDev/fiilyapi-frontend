import type { ContractListItem } from "@/lib/api/hooks/useContracts";
import type { SubcontractorListItem } from "@/lib/api/hooks/useSubcontractors";
import type { SubcontractorProgressPaymentListItem } from "@/lib/api/hooks/useSubcontractorProgressPayments";

/**
 * TL · `Taşeron Listesi.dc.html` — İSTEMCİ AGREGASYONU.
 *
 * `GET /subcontractors` yalnız FİRMA kartını verir (ad/VKN/telefon/kategori);
 * mockup'ın tablo kolonları (58-61 Aktif Sözl. · Toplam Sözl. Bedeli · Ödenen ·
 * Bekleyen Hak.) ve 4 KPI (35-38) HİÇBİR uçta hazır değildir — burada
 * birleştirilir.
 *
 * ### Kaynaklar ve neden bunlar
 * 1. `GET /subcontractors` — firma satırlarının kendisi (35 KPI'ı da budur).
 * 2. `GET /contracts?type=subcontractor` — sözleşme türevleri (Aktif Sözl.,
 *    Toplam Sözl. Bedeli, 36 KPI, satırın "Detay →" hedefi).
 * 3. `GET /subcontractor-progress-payments` — hakediş türevleri (Ödenen,
 *    Bekleyen Hak., 37 + 38 KPI'ları).
 *
 * ⚠️ **Görev emrinden bilinçli ve raporlanan sapma:** emir 2. kaynak olarak U1
 * (`GET /subcontractor-contracts`) diyordu. U1 sözleşme BEDELİ TAŞIMAZ —
 * openapi'deki kendi açıklaması bunu açıkça yazar: "Bilinçli olarak DAR:
 * bedel/hakediş türevleri TAŞIMAZ (onlar birleşik `/contracts?type=
 * subcontractor` ucunun işidir)". Mockup 59'daki "Toplam Sözl. Bedeli" kolonu
 * U1'den ÜRETİLEMEZ. İki ucu birden çağırmak aynı satır kümesini iki kez
 * çekip iki farklı sayı üretme riski doğurur, o yüzden bedeli DE taşıyan tek
 * uç (`/contracts?type=subcontractor`) seçildi. Yan etki: bu uçta SAYFALAMA
 * YOKTUR (`ContractListResponse` yalnız `summary`+`items`), yani sözleşme
 * tarafında kırpılma kavramı tanımsızdır; kırpılma korkuluğu YALNIZ hakediş
 * listesine (`limit` tavanı 200) uygulanır.
 *
 * ### 🛑 EŞLEŞTİRME SINIRI (raporlanan çelişki)
 * Hiçbir LİSTE ucu `subcontractor_id` taşımaz: `ContractListItem` yalnız
 * `counterparty_name`, `SubcontractorProgressPaymentListItem` yalnız
 * `subcontractor_name` verir (kimlik yalnız `SubcontractorContractDetail`de
 * var, o da sözleşme BAŞINA bir çağrı demek). Bu yüzden firma ↔ sözleşme bağı
 * NORMALLEŞTİRİLMİŞ AD üzerinden kurulur. Adı hiçbir firmayla eşleşmeyen
 * sözleşmeler sessizce YUTULMAZ: `orphanContractCount` ile dışarı verilir ve
 * ekranda görünür not basılır.
 *
 * 🔴 AD TEKİL DEĞİLDİR. Kovalar FİRMA KİMLİĞİYLE (`firm.id`) tutulur, adla
 * DEĞİL: ad hiçbir katmanda tekil değildir (backend `subcontractors`
 * tablosunda yalnız KISMİ `uq_subcontractors_tax_number` ve NON-UNIQUE
 * `ix_subcontractors_name` vardır; VKN bile zorunlu değildir). Adla
 * anahtarlanınca `Map.set` ikinci firmanın kovasını birincinin üstüne yazar ve
 * İKİ AYRI TÜZEL KİŞİNİN parası toplanıp her iki satıra da basılırdı.
 * Ad tabanlı eşleştirme yalnız sözleşme/hakediş → firma yönünde ve YALNIZ
 * eşleşme TEKSE yapılır; bir ad birden çok firmaya uyuyorsa sözleşme hiçbirine
 * atfedilmez (uydurulmuş sayı basmayız) ve `ambiguousContractCount` ile
 * dışarı verilir.
 */

/** Firma ↔ sözleşme/hakediş eşleştirme anahtarı (ad tabanlı — yukarıdaki sınır). */
export function subcontractorKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLocaleLowerCase("tr");
}

/** Para değeri PENDING ise `null` — kırpılmış listeden yanlış toplam BASILMAZ. */
export type PendingMoney = number | null;

export interface SubcontractorRow {
  id: string;
  /** 56 · kalın firma adı. */
  name: string;
  /** 56 · alt satır "VKN: … · İletişim: …" parçaları (boş olanlar atlanır). */
  taxNumber: string | null;
  phone: string | null;
  /** 57 · serbest metin kategori rozeti. */
  category: string | null;
  /** 58 · `status === "active"` ve taslak OLMAYAN sözleşme sayısı. */
  activeContractCount: number;
  /** 59 · taslak olmayan TÜM sözleşmelerin bedel toplamı. */
  contractTotal: number;
  /** 60 · `paid` hakedişlerin net toplamı. Kırpılmada `null` (PENDING). */
  paidTotal: PendingMoney;
  /** 61 · `paid` OLMAYAN hakedişlerin net toplamı. Kırpılmada `null`. */
  pendingTotal: PendingMoney;
  /**
   * 🔴 IZN-F4b.2 — `paidTotal`/`pendingTotal` `null` ise NEDEN: hakedişlerden en az birinin `net_total`ı
   * rol için gizli (`null`) mi? Gizliyse toplam BİLİNMEZ (null'ı 0 sayıp eksik toplam basmak YASAK) ve
   * ekran kırpılma gerekçesi yerine "gizli" ipucunu gösterir.
   */
  isPaidMasked: boolean;
  isPendingMasked: boolean;
  /** 63 "Detay →" hedefi; firmanın hiç sözleşmesi yoksa `null` (devre dışı). */
  detailContractId: string | null;
}

export interface SubcontractorSummary {
  /** 35 · toplam taşeron firma. */
  totalCount: number;
  /** 36 · aktif sözleşme (taslak hariç). */
  activeContractCount: number;
  /** 37 · içinde bulunulan DÖNEME ait hakedişlerin net toplamı; kırpılmada `null`. */
  monthPaymentTotal: PendingMoney;
  /** IZN-F4b.2 — `monthPaymentTotal` `null`sa nedeni gizli `net_total` mı (kırpılma DEĞİL). */
  isMonthPaymentMasked: boolean;
  /** 38 · `pending_approval` hakediş sayısı; kırpılmada `null`. */
  pendingApprovalCount: number | null;
}

export interface SubcontractorDirectory {
  rows: SubcontractorRow[];
  summary: SubcontractorSummary;
  /** 30 · kategori süzgecinin GERÇEK seçenekleri (mockup'ın sabit üçlüsü artefakt). */
  categories: string[];
  /** Adı hiçbir firmayla eşleşmeyen sözleşme sayısı (taslak hariç) — görünür not. */
  orphanContractCount: number;
  /**
   * M5_1 kayıt #344: adı hiçbir firmayla eşleşmeyen TASLAK sözleşme sayısı.
   * Eskiden `!contract.is_draft` dalı yalnız yayınlanmış yetimleri sayardı —
   * taslak yetimler hiçbir sayaca girmiyor, dolayısıyla hiçbir banta düşmüyordu.
   * Ayrı sayaçla dışarı verilir; "sessizce yutulmaz" invariantı taslak için de
   * geçerli olsun diye `orphanContractCount`e KARIŞTIRILMAZ (taslak/yayın
   * ayrımı çağıran tarafın işine yarayabilir).
   */
  orphanDraftContractCount: number;
  /** Adı BİRDEN ÇOK firmaya uyduğu için atfedilemeyen sözleşme sayısı. */
  ambiguousContractCount: number;
  /** Hakediş listesi kırpıldı — para kolonları/KPI'ları PENDING. */
  isPaymentPending: boolean;
}

export interface BuildDirectoryInput {
  subcontractors: SubcontractorListItem[];
  contracts: ContractListItem[];
  payments: SubcontractorProgressPaymentListItem[];
  /** `buildListTruncation(...).isTruncated` — hakediş listesi eksik mi. */
  isPaymentTruncated: boolean;
  /** 37 KPI'ının dönemi. Çağıran taraf verir (test edilebilirlik). */
  currentYear: number;
  /** 1-12. */
  currentMonth: number;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface Accumulator {
  activeContractCount: number;
  contractTotal: number;
  paidTotal: number;
  pendingTotal: number;
  isPaidMasked: boolean;
  isPendingMasked: boolean;
  contracts: ContractListItem[];
}

function emptyAccumulator(): Accumulator {
  return {
    activeContractCount: 0,
    contractTotal: 0,
    paidTotal: 0,
    pendingTotal: 0,
    isPaidMasked: false,
    isPendingMasked: false,
    contracts: [],
  };
}

/**
 * 63 "Detay →" hedefi. Firmanın birden çok sözleşmesi olabilir (mockup 58'de
 * ilk satırın "Aktif Sözl." değeri 2'dir) ama link TEK bir sözleşme detayına
 * (`Taşeron Sözleşme Detay.dc.html` = `/sozlesmeler/taseron/{contractId}`)
 * gider. Seçim DETERMİNİSTİKTİR: önce aktif + taslak olmayan, sonra taslak
 * olmayan, sonra kalan; eşitlikte sözleşme no'suna göre.
 */
function pickDetailContract(contracts: ContractListItem[]): ContractListItem | null {
  const rank = (contract: ContractListItem): number => {
    if (contract.is_draft) return 2;
    return contract.status === "active" ? 0 : 1;
  };
  const sorted = [...contracts].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (a.contract_no ?? "").localeCompare(b.contract_no ?? "", "tr");
  });
  return sorted[0] ?? null;
}

export function buildSubcontractorDirectory({
  subcontractors,
  contracts,
  payments,
  isPaymentTruncated,
  currentYear,
  currentMonth,
}: BuildDirectoryInput): SubcontractorDirectory {
  // Kova anahtarı FİRMA KİMLİĞİDİR (ad tekil değildir — üstteki nota bak).
  const byId = new Map<string, Accumulator>();
  // Ad → o adı taşıyan firma kimlikleri. Uzunluk > 1 ise ad BELİRSİZDİR.
  const firmIdsByName = new Map<string, string[]>();
  for (const firm of subcontractors) {
    byId.set(firm.id, emptyAccumulator());
    const nameKey = subcontractorKey(firm.name);
    firmIdsByName.set(nameKey, [...(firmIdsByName.get(nameKey) ?? []), firm.id]);
  }

  /** Ad TEK bir firmaya uyuyorsa onun kimliği; 0 ya da >1 eşleşmede `null`. */
  const uniqueFirmIdOf = (nameKey: string): string | null => {
    const ids = firmIdsByName.get(nameKey);
    return ids && ids.length === 1 ? ids[0] : null;
  };

  // Hakedişin firmasını sözleşme kimliği üzerinden çözebilmek için harita
  // (hakediş satırının kendi `subcontractor_name`i yedek yoldur). LİSTEDEKİ
  // HER sözleşme girer; çözülemeyen sözleşme `null` taşır. `null` ile
  // `undefined` ayrımı davranışsaldır: sözleşme listede VARSA ve firmasına
  // bağlanamadıysa hakediş ADA GÖRE yeniden denenmez (eski davranış korunur),
  // yalnız sözleşmesi hiç listede olmayan hakediş yedek yola düşer.
  const firmIdByContractId = new Map<string, string | null>();
  let orphanContractCount = 0;
  let orphanDraftContractCount = 0;
  let ambiguousContractCount = 0;

  for (const contract of contracts) {
    const key = subcontractorKey(contract.counterparty_name);
    const firmId = uniqueFirmIdOf(key);
    if (firmId === null) {
      // Yetim sözleşme haritaya HİÇ girmez: aksi hâlde aşağıdaki hakediş
      // döngüsündeki `??` yedeği (`subcontractor_name` üzerinden yeniden
      // deneme) hiçbir zaman devreye giremezdi (kalan-6 no 324).
      if (!contract.is_draft) {
        if (firmIdsByName.has(key)) ambiguousContractCount += 1;
        else orphanContractCount += 1;
      } else if (!firmIdsByName.has(key)) {
        // M5_1 kayıt #344: taslak yetimler AYRI sayaçta — sessizce yutulmaz.
        orphanDraftContractCount += 1;
      }
      continue;
    }
    firmIdByContractId.set(contract.id, firmId);
    const bucket = byId.get(firmId);
    if (!bucket) continue;
    bucket.contracts.push(contract);
    // Taslak sözleşme ne "aktif"tir ne de gerçekleşmiş bir bedeldir.
    if (contract.is_draft) continue;
    // 🔴 Maskeli bedel (kapsam kısıtlı rol) toplama GİRMEZ ve `0` sayılmaz;
    //    `toNumber(null)` 0 verip toplamı sessizce eksiltirdi.
    if (contract.amount !== null) bucket.contractTotal += toNumber(contract.amount);
    if (contract.status === "active") bucket.activeContractCount += 1;
  }

  let monthPaymentTotal = 0;
  let isMonthPaymentMasked = false;
  let pendingApprovalCount = 0;

  for (const payment of payments) {
    if (payment.status === "pending_approval") pendingApprovalCount += 1;
    // 🔴 KAYIT NO 341 — "Bu Ay Ödeme" (SubcontractorsSummaryStrip 37 KPI'ı)
    // ÖDEME anlamına gelir; aynı ekranda "Ödenen" kolonu (aşağıda) yalnız
    // `paid` sayar. Statü süzgeci olmadan taslak/onay bekleyen hakedişler de
    // buraya girerdi — iki KPI aynı kelimeyi (Ödeme) iki farklı tanımla
    // kullanırdı. Yalnız GERÇEKLEŞMİŞ ödeme (paid) sayılır.
    if (
      payment.status === "paid" &&
      payment.period_year === currentYear &&
      payment.period_month === currentMonth
    ) {
      // 🔴 IZN-F4b.2: gizli (null) net tutar toplama GİRMEZ ve 0 sayılmaz — toplam BİLİNMEZ olur.
      if (payment.net_total === null) isMonthPaymentMasked = true;
      else monthPaymentTotal += toNumber(payment.net_total);
    }
    const mapped = firmIdByContractId.get(payment.contract_id);
    const firmId =
      mapped !== undefined ? mapped : uniqueFirmIdOf(subcontractorKey(payment.subcontractor_name));
    if (firmId === null) continue;
    const bucket = byId.get(firmId);
    if (!bucket) continue;
    if (payment.status === "paid") {
      if (payment.net_total === null) bucket.isPaidMasked = true;
      else bucket.paidTotal += toNumber(payment.net_total);
    } else if (payment.status !== "draft") {
      // 🔴 KAYIT NO 342 — taslak hakediş, taslak SÖZLEŞMENİN eşi (satır
      // ~213 `if (contract.is_draft) continue;`): henüz sunulmamış bir
      // hakediş "Bekleyen Hak." toplamına giremez, aksi hâlde hiç onaya
      // girmemiş bir taslak "bekliyor" gibi görünür.
      if (payment.net_total === null) bucket.isPendingMasked = true;
      else bucket.pendingTotal += toNumber(payment.net_total);
    }
  }

  const rows: SubcontractorRow[] = subcontractors
    .map((firm) => {
      const bucket = byId.get(firm.id) ?? emptyAccumulator();
      const detail = pickDetailContract(bucket.contracts);
      return {
        id: firm.id,
        name: firm.name,
        taxNumber: firm.tax_number,
        phone: firm.phone,
        category: firm.category,
        activeContractCount: bucket.activeContractCount,
        contractTotal: bucket.contractTotal,
        paidTotal: isPaymentTruncated || bucket.isPaidMasked ? null : bucket.paidTotal,
        pendingTotal: isPaymentTruncated || bucket.isPendingMasked ? null : bucket.pendingTotal,
        isPaidMasked: !isPaymentTruncated && bucket.isPaidMasked,
        isPendingMasked: !isPaymentTruncated && bucket.isPendingMasked,
        detailContractId: detail?.id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const categories = Array.from(
    new Set(
      subcontractors
        .map((firm) => firm.category?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ).sort((a, b) => a.localeCompare(b, "tr"));

  return {
    rows,
    summary: {
      totalCount: subcontractors.length,
      activeContractCount: contracts.filter(
        (contract) => !contract.is_draft && contract.status === "active",
      ).length,
      monthPaymentTotal: isPaymentTruncated || isMonthPaymentMasked ? null : monthPaymentTotal,
      isMonthPaymentMasked: !isPaymentTruncated && isMonthPaymentMasked,
      pendingApprovalCount: isPaymentTruncated ? null : pendingApprovalCount,
    },
    categories,
    orphanContractCount,
    orphanDraftContractCount,
    ambiguousContractCount,
    isPaymentPending: isPaymentTruncated,
  };
}

export interface SubcontractorFilter {
  /** 28 · "Taşeron ara..." — İSTEMCİDE süzer (aşağıdaki nota bak). */
  query: string;
  /** 30 · kategori seçimi; boş string = "Tüm Kategoriler". */
  category: string;
}

/**
 * 28/30 · arama + kategori süzmesi İSTEMCİDE yapılır.
 *
 * `GET /subcontractors` ucunda bir `q` parametresi VARDIR (spec §2 "arama
 * parametresi yok" der — bu iddia openapi ile çelişir, rapora yazıldı); yine de
 * kullanılmaz: bu ekranın satırları üç kaynağın istemci birleşimidir ve
 * sunucuda süzülmüş kısmi bir firma listesi KPI'ları (35 "Toplam Taşeron")
 * bozardı. Kategori süzmesinin sunucu karşılığı zaten hiç yoktur.
 */
export function filterSubcontractorRows(
  rows: SubcontractorRow[],
  { query, category }: SubcontractorFilter,
): SubcontractorRow[] {
  const needle = query.trim().toLocaleLowerCase("tr");
  return rows.filter((row) => {
    if (category && (row.category ?? "") !== category) return false;
    if (!needle) return true;
    return (
      row.name.toLocaleLowerCase("tr").includes(needle) ||
      (row.taxNumber ?? "").toLocaleLowerCase("tr").includes(needle) ||
      (row.category ?? "").toLocaleLowerCase("tr").includes(needle)
    );
  });
}
