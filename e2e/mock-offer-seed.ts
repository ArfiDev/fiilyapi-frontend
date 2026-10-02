// TKL-F3.2 · sahte backend teklif TOHUMU — gerçekçi, her durumdan en az bir teklif.
//
// Tohum, ekranların görsel/özellik kareleri için YETERLİ çeşitliliği taşır (liste kartları, "süresi
// geçti", fiyatsız kalem, elle B.F., kazanma oranı) ama KATALOG SON FİYATINI DEĞİŞTİRMEZ: kazanılan
// tohum teklifin fiyatlı kalemleri, kendilerinden DAHA YENİ SZL kaynağı olan katalog kalemleridir
// (Kalıp 15.09.2026 · Demir 01.08.2026) — TKL kaynağı o kalemlerde kaybeder ve mevcut KİK
// (İş Kalemi Kataloğu) görsel/e2e kareleri oynamaz. `mock-offers.test.ts` bunu kilitler.
import { quantizeDecimal } from "./mock-offer-calc";
import { emptyOffersState, nextId, type GroupRec, type ItemRec, type MockUser, type OfferRec, type OffersState, type OfferStatus, type RevisionRec } from "./mock-offer-types";
import { seedTemplates } from "./mock-offer-templates";
import type { OfferCatalogEntry } from "./mock-offers";

export interface OffersSeedInput {
  catalog: readonly OfferCatalogEntry[];
  employers: ReadonlyArray<{ id: string; name: string }>;
  users: MockUser[];
  clock?: () => Date;
}

interface SeedItem {
  catalogName: string;
  group: string;
  /** `null` = miktar girilmedi (SO-21). */
  quantity: string | null;
  cost: string | null;
  overheadPct?: string;
  profitPct?: string;
  offerUnitPrice?: string;
}

interface SeedRevision {
  status: OfferStatus;
  offerDate: string;
  validityDays?: number;
  stamps?: { sent?: string; won?: string; lost?: string; withdrawn?: string };
  lostReason?: string;
  winningAmount?: string;
  items: SeedItem[];
  groups?: string[];
}

interface SeedOffer {
  employer: string;
  title: string;
  scope: string | null;
  /** Hangi tohum ŞABLONUYLA oluşturuldu (`mock-offer-templates.ts` `SEED_TEMPLATES` adı); yok = şablonsuz. */
  template?: string;
  createdAt: string;
  revisions: SeedRevision[];
}

const ZERO_STAMPS = { sent: null, won: null, lost: null, withdrawn: null } as const;

const SEED: readonly SeedOffer[] = [
  {
    employer: "emp-1",
    title: "A Blok Kaba İnşaat",
    scope: "Temel + kolon/perde + döşeme · 12 kat",
    template: "Kaba İnşaat Standart",
    createdAt: "2026-03-02T08:30:00.000Z",
    revisions: [
      {
        status: "lost",
        offerDate: "2026-03-04",
        stamps: { sent: "2026-03-06T10:00:00.000Z", lost: "2026-04-02T14:20:00.000Z" },
        lostReason: "Fiyat yüksek bulundu",
        winningAmount: "10450000.00",
        items: [
          { catalogName: "Kalıp", group: "Kaba İnşaat", quantity: "4800", cost: "190.00" },
          { catalogName: "Demir", group: "Kaba İnşaat", quantity: "520", cost: "29100.00" },
        ],
      },
      {
        status: "won",
        offerDate: "2026-04-10",
        stamps: { sent: "2026-04-11T09:00:00.000Z", won: "2026-04-25T16:45:00.000Z" },
        items: [
          { catalogName: "Kalıp", group: "Kaba İnşaat", quantity: "4800", cost: "185.00" },
          { catalogName: "Demir", group: "Kaba İnşaat", quantity: "520", cost: "28500.00", profitPct: "12" },
          { catalogName: "Beton döküm", group: "Kaba İnşaat", quantity: "3100", cost: null },
        ],
      },
    ],
  },
  {
    employer: "emp-2",
    title: "Konut Bloğu Duvar ve Sıva",
    scope: "Tuğla duvar + iç/dış sıva · 8 blok",
    createdAt: "2026-09-17T11:00:00.000Z",
    revisions: [
      {
        status: "sent",
        offerDate: "2026-09-18",
        validityDays: 30,
        stamps: { sent: "2026-09-20T12:00:00.000Z" },
        items: [
          { catalogName: "Tuğla duvar", group: "Duvar", quantity: "6400", cost: "310.50" },
          { catalogName: "İç sıva", group: "Sıva", quantity: "12800", cost: "88.00", overheadPct: "10" },
          { catalogName: "Dış sıva", group: "Sıva", quantity: "5200", cost: "112.50", offerUnitPrice: "150.00" },
        ],
      },
    ],
  },
  {
    employer: "emp-3",
    title: "Sosyal Tesis Mekanik Tesisat",
    scope: null,
    createdAt: "2026-07-30T09:15:00.000Z",
    revisions: [
      {
        status: "sent",
        offerDate: "2026-08-01",
        validityDays: 30, // 31.08.2026'da doldu → "süresi geçti"
        stamps: { sent: "2026-08-02T08:00:00.000Z" },
        items: [
          { catalogName: "Pis su borusu", group: "Tesisat", quantity: "1850", cost: "96.75" },
          { catalogName: "Temiz su borusu", group: "Tesisat", quantity: "2200", cost: null },
        ],
      },
    ],
  },
  {
    employer: "emp-1",
    title: "B Blok Elektrik Tesisatı",
    scope: "Kablo çekimi + buat/priz",
    template: "Elektrik Tesisatı",
    createdAt: "2026-09-28T13:40:00.000Z",
    revisions: [
      {
        status: "draft",
        offerDate: "2026-09-28",
        groups: ["Elektrik", "Topraklama"],
        items: [
          { catalogName: "Kablo çekimi", group: "Elektrik", quantity: "18500", cost: "42.00" },
          { catalogName: "Buat/priz montajı", group: "Elektrik", quantity: "960", cost: null },
          { catalogName: "Topraklama", group: "Topraklama", quantity: "1200", cost: "64.00", offerUnitPrice: "90.00" },
        ],
      },
    ],
  },
  {
    employer: "emp-2",
    title: "Çevre Düzenleme Kaba İşler",
    scope: null,
    createdAt: "2026-06-10T10:00:00.000Z",
    revisions: [
      {
        status: "withdrawn",
        offerDate: "2026-06-12",
        stamps: { withdrawn: "2026-06-30T15:00:00.000Z" },
        items: [{ catalogName: "Grobeton", group: "Kaba", quantity: "850", cost: "1850.00" }],
      },
    ],
  },
  {
    employer: "emp-3",
    title: "Yol Yenileme Hazır Beton",
    scope: "Hazır beton döküm ve donatı",
    createdAt: "2026-05-05T08:00:00.000Z",
    revisions: [
      {
        status: "lost",
        offerDate: "2026-05-06",
        stamps: { sent: "2026-05-08T09:30:00.000Z", lost: "2026-05-29T11:10:00.000Z" },
        lostReason: "Rakip teklif daha düşük",
        items: [{ catalogName: "Beton döküm", group: "Beton", quantity: "2400", cost: "2380.00" }],
      },
    ],
  },
  {
    employer: "emp-1",
    title: "C Blok İnce İşler (boş taslak)",
    scope: null,
    createdAt: "2026-10-01T07:50:00.000Z",
    revisions: [{ status: "draft", offerDate: "2026-10-01", items: [] }],
  },
];

/** Teklifin son hareketi: en geç durum damgası (yoksa oluşturulma). */
function latestStamp(spec: SeedOffer): string {
  const stamps = spec.revisions.flatMap((rev) => [rev.stamps?.sent, rev.stamps?.won, rev.stamps?.lost, rev.stamps?.withdrawn]);
  return stamps.filter((value): value is string => value !== undefined).reduce((top, value) => (value > top ? value : top), spec.createdAt);
}

function addGroup(state: OffersState, revisionId: string, name: string, order: number): GroupRec {
  const group: GroupRec = { id: nextId(state, "group"), revisionId, name, sortOrder: order };
  state.groups = [...state.groups, group];
  return group;
}

function seedRevision(
  state: OffersState,
  offer: OfferRec,
  revNo: number,
  spec: SeedRevision,
  catalog: ReadonlyMap<string, OfferCatalogEntry>,
  actorId: string,
): void {
  const stamps = { ...ZERO_STAMPS, ...spec.stamps };
  const opened = revNo === 0 ? offer.createdAt : `${spec.offerDate}T08:00:00.000Z`;
  const lastStamp = [stamps.sent, stamps.won, stamps.lost, stamps.withdrawn].filter((value): value is string => value !== null).sort().pop();
  const revision: RevisionRec = {
    id: nextId(state, "revision"),
    offerId: offer.id,
    revNo,
    status: spec.status,
    offerDate: spec.offerDate,
    validityDays: spec.validityDays ?? 30,
    overheadPct: "12.00",
    profitPct: "15.00",
    vatPct: "20.00",
    paymentTerms: "Ödeme aylık hakedişle, 30 gün vadeli",
    deliveryDays: null,
    priceEscalation: "fixed",
    priceIndexType: null,
    notes: null,
    createdAt: opened,
    updatedAt: lastStamp ?? opened,
    sentAt: stamps.sent,
    wonAt: stamps.won,
    lostAt: stamps.lost,
    withdrawnAt: stamps.withdrawn,
    lostReason: spec.lostReason ?? null,
    winningAmount: spec.winningAmount ?? null,
    createdBy: actorId,
    sentBy: stamps.sent === null ? null : actorId,
    wonBy: stamps.won === null ? null : actorId,
    lostBy: stamps.lost === null ? null : actorId,
    withdrawnBy: stamps.withdrawn === null ? null : actorId,
  };
  state.revisions = [...state.revisions, revision];

  const groupNames = [...new Set([...(spec.groups ?? []), ...spec.items.map((item) => item.group)])];
  const groups = new Map(groupNames.map((name, order) => [name, addGroup(state, revision.id, name, order)] as const));
  const orders = new Map<string, number>();
  const items: ItemRec[] = spec.items.map((item) => {
    const entry = catalog.get(item.catalogName);
    if (entry === undefined) throw new Error(`tohum: katalogda yok → ${item.catalogName}`);
    const group = groups.get(item.group) as GroupRec;
    const sortOrder = orders.get(group.id) ?? 0;
    orders.set(group.id, sortOrder + 1);
    return {
      id: nextId(state, "item"),
      revisionId: revision.id,
      groupId: group.id,
      sortOrder,
      catalogItemId: entry.id,
      pozNo: entry.pozNo,
      description: entry.name,
      unit: entry.uom,
      quantity: item.quantity === null ? null : quantizeDecimal(item.quantity, 3),
      unitMhr: quantizeDecimal(entry.standardUnitMhr, 4),
      costUnitPrice: item.cost,
      overheadPct: item.overheadPct === undefined ? null : quantizeDecimal(item.overheadPct, 2),
      profitPct: item.profitPct === undefined ? null : quantizeDecimal(item.profitPct, 2),
      offerUnitPrice: item.offerUnitPrice ?? null,
    };
  });
  state.items = [...state.items, ...items];
}

/**
 * Tohumlu durum. Sayaç `TKL-2026-0007`ye ilerler; yeni teklif ilk olarak `TKL-2026-0008` alır
 * (clock gerçek zaman olduğunda yıl İstanbul yılıdır — yıl başında sıfırlanır).
 */
export function createOffersState(input: OffersSeedInput): OffersState {
  const state = emptyOffersState(input.users, input.clock);
  const catalog = new Map(input.catalog.map((entry) => [entry.name, entry] as const));
  const actor = input.users[0];
  if (actor === undefined) throw new Error("tohum: en az bir kullanıcı gerekir");
  const employerName = new Map(input.employers.map((employer) => [employer.id, employer.name] as const));
  const templateIds = seedTemplates(state, catalog);
  SEED.forEach((spec, index) => {
    const offer: OfferRec = {
      id: nextId(state, "offer"),
      offerNo: `TKL-2026-${String(index + 1).padStart(4, "0")}`,
      employerId: spec.employer,
      employerName: employerName.get(spec.employer) ?? spec.employer,
      title: spec.title,
      scopeSummary: spec.scope,
      preparedByUserId: actor.id,
      templateId: spec.template === undefined ? null : (templateIds.get(spec.template) ?? null),
      projectId: null,
      convertedAt: null,
      convertedByUserId: null,
      project: null,
      createdAt: spec.createdAt,
      updatedAt: latestStamp(spec),
    };
    state.offers = [...state.offers, offer];
    spec.revisions.forEach((revision, revNo) => seedRevision(state, offer, revNo, revision, catalog, actor.id));
  });
  state.counters = { 2026: SEED.length };
  return state;
}
