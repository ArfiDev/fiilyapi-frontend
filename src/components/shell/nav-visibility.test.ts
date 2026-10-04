import { describe, expect, it } from "vitest";
import type { NavGroup, NavItem } from "./nav-config";
import { visibleNavGroups, type NavVisibilityMe, type NavVisibilityPage } from "./nav-visibility";

const Icon: NavItem["Icon"] = () => null as never;

const GROUPS: NavGroup[] = [
  {
    heading: "Saha",
    items: [
      { label: "Puantaj", pageKey: "saha.puantaj", href: "/puantaj", Icon },
      { label: "Günlük Kayıt", pageKey: "saha.gunluk_kayit", href: "/gunluk-kayit", Icon },
    ],
  },
  { heading: "İK", items: [{ label: "Personel", pageKey: "ik.personel", href: "/personel", Icon }] },
];

const CATALOG: NavVisibilityPage[] = [
  { key: "saha.puantaj", twins: ["santiye.puantaj", "bolum.puantaj"] },
  { key: "saha.gunluk_kayit", twins: ["santiye.gunluk_kayit"] },
  { key: "ik.personel", twins: [] },
];

const grant = (level: "none" | "view" | "edit") => ({ level, approve: false });

function labels(groups: NavGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.label));
}

// `null` = katalog henüz yüklenmedi (usePages `data: undefined`); verilmezse tam katalog.
function visible(me: NavVisibilityMe | null, pages: NavVisibilityPage[] | null = CATALOG): string[] {
  return labels(visibleNavGroups(GROUPS, me, pages ?? undefined));
}

describe("visibleNavGroups", () => {
  it("level none olan öğeyi gizler", () => {
    const me = { is_system_admin: false, pages: { "ik.personel": grant("none") } };
    expect(visible(me)).not.toContain("Personel");
  });

  it("level view ve edit olan öğeleri gösterir", () => {
    const me = {
      is_system_admin: false,
      pages: { "saha.puantaj": grant("view"), "saha.gunluk_kayit": grant("edit"), "ik.personel": grant("view") },
    };
    expect(visible(me)).toEqual(["Puantaj", "Günlük Kayıt", "Personel"]);
  });

  it("grant'ı olmayan (bilinmez) anahtarı GÖRÜNÜR bırakır; hücresiz rol (pages = {}) hepsini görür", () => {
    expect(visible({ is_system_admin: false, pages: { "ik.personel": grant("none") } })).toEqual([
      "Puantaj",
      "Günlük Kayıt",
    ]);
    expect(visible({ is_system_admin: false, pages: {} })).toEqual(["Puantaj", "Günlük Kayıt", "Personel"]);
    expect(visible({ is_system_admin: false })).toEqual(["Puantaj", "Günlük Kayıt", "Personel"]);
  });

  it("is_system_admin none hücreleri olsa bile her şeyi gösterir", () => {
    const me = { is_system_admin: true, pages: { "saha.puantaj": grant("none"), "ik.personel": grant("none") } };
    expect(visible(me, null)).toEqual(["Puantaj", "Günlük Kayıt", "Personel"]);
  });

  it("oturum yokken (yükleniyor) menü eskisi gibi tam görünür", () => {
    expect(visible(null)).toEqual(["Puantaj", "Günlük Kayıt", "Personel"]);
  });

  describe("KARAR 5 — proje verili kök sayfa ve ikizleri", () => {
    it("kök none ama ikizlerinden biri view → görünür", () => {
      const me = { is_system_admin: false, pages: { "saha.puantaj": grant("none"), "bolum.puantaj": grant("view") } };
      expect(visible(me)).toContain("Puantaj");
    });

    it("kök ve TÜM ikizleri none → gizli", () => {
      const me = {
        is_system_admin: false,
        pages: { "saha.puantaj": grant("none"), "santiye.puantaj": grant("none"), "bolum.puantaj": grant("none") },
      };
      expect(visible(me)).not.toContain("Puantaj");
    });

    it("katalog yüklenmemişken ikiz kuralı uygulanmaz: kök none ise yüklenene kadar gizli", () => {
      const me = { is_system_admin: false, pages: { "saha.puantaj": grant("none"), "santiye.puantaj": grant("edit") } };
      expect(visible(me, null)).not.toContain("Puantaj");
      expect(visible(me, CATALOG)).toContain("Puantaj");
    });

    it("ikizi olmayan kök sayfa ikiz kuralından yararlanmaz", () => {
      const me = { is_system_admin: false, pages: { "ik.personel": grant("none"), "santiye.puantaj": grant("edit") } };
      expect(visible(me)).not.toContain("Personel");
    });
  });

  it("boş kalan grubun başlığı gizlenir; dolu grup kalır", () => {
    const me = { is_system_admin: false, pages: { "ik.personel": grant("none") } };
    expect(visibleNavGroups(GROUPS, me, CATALOG).map((group) => group.heading)).toEqual(["Saha"]);
  });

  it("girdi gruplarını değiştirmez", () => {
    const me = { is_system_admin: false, pages: { "ik.personel": grant("none") } };
    visibleNavGroups(GROUPS, me, CATALOG);
    expect(GROUPS).toHaveLength(2);
    expect(GROUPS[1].items).toHaveLength(1);
  });
});

// IZN-F1.3 — çok sayfalı menü öğeleri: öğe, kendi anahtarı YA DA extraPageKeys'ten biri none değilse görünür.
describe("visibleNavGroups · extraPageKeys", () => {
  const MULTI: NavGroup[] = [
    {
      heading: "Mali",
      items: [
        {
          label: "Hakedişler",
          pageKey: "mali.hakedis_isveren",
          extraPageKeys: ["mali.hakedis_taseron"],
          href: "/hakedisler",
          Icon,
        },
        { label: "Hazine", pageKey: "mali.hazine", href: "/hazine", Icon },
      ],
    },
  ];
  const catalog: NavVisibilityPage[] = [
    { key: "mali.hakedis_isveren", twins: ["santiye.hakedisler"] },
    { key: "mali.hakedis_taseron", twins: ["bolum.hakedis"] },
  ];
  // `null` = katalog henüz yüklenmedi; verilmezse tam katalog.
  const names = (me: NavVisibilityMe, pages: NavVisibilityPage[] | null = catalog): string[] =>
    labels(visibleNavGroups(MULTI, me, pages ?? undefined));

  it("işveren hakedişi none + taşeron hakedişi view → Hakedişler görünür", () => {
    const me = { is_system_admin: false, pages: { "mali.hakedis_isveren": grant("none"), "mali.hakedis_taseron": grant("view") } };
    expect(names(me)).toContain("Hakedişler");
  });

  it("tüm anahtarlar none → Hakedişler gizli (başlık da: öteki öğe Hazine görünür kalır)", () => {
    const me = {
      is_system_admin: false,
      pages: { "mali.hakedis_isveren": grant("none"), "mali.hakedis_taseron": grant("none"), "mali.hazine": grant("view") },
    };
    expect(names(me)).toEqual(["Hazine"]);
  });

  it("KARAR 5 her anahtar için geçerli: kök ve extra none ama extra'nın ikizi view → görünür", () => {
    const me = {
      is_system_admin: false,
      pages: { "mali.hakedis_isveren": grant("none"), "mali.hakedis_taseron": grant("none"), "bolum.hakedis": grant("view") },
    };
    expect(names(me)).toContain("Hakedişler");
    expect(names(me, null)).not.toContain("Hakedişler");
  });

  it("kendi anahtarı eksikse (grant yok) extra none olsa da görünür", () => {
    const me = { is_system_admin: false, pages: { "mali.hakedis_taseron": grant("none") } };
    expect(names(me)).toContain("Hakedişler");
  });

  it("extra anahtarın grant'ı eksikse o anahtar erişim SAYILMAZ (kendi anahtarı none → gizli)", () => {
    const me = { is_system_admin: false, pages: { "mali.hakedis_isveren": grant("none") } };
    expect(names(me)).not.toContain("Hakedişler");
  });

  it("Personel: ik.personel none + ik.izin_yonetimi view → Personel görünür", () => {
    const personel: NavGroup[] = [
      {
        heading: "İK",
        items: [
          {
            label: "Personel",
            pageKey: "ik.personel",
            extraPageKeys: ["ik.izin_yonetimi", "ik.belge_sertifika"],
            href: "/personel",
            Icon,
          },
        ],
      },
    ];
    const me = { is_system_admin: false, pages: { "ik.personel": grant("none"), "ik.izin_yonetimi": grant("view"), "ik.belge_sertifika": grant("none") } };
    expect(labels(visibleNavGroups(personel, me, []))).toEqual(["Personel"]);
    const allNone = { is_system_admin: false, pages: { "ik.personel": grant("none"), "ik.izin_yonetimi": grant("none"), "ik.belge_sertifika": grant("none") } };
    expect(visibleNavGroups(personel, allNone, [])).toEqual([]);
  });
});
