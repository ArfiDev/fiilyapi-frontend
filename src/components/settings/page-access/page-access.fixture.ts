import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PageCatalogEntry } from "@/lib/api/hooks/usePages";
import type { PageGrant, PageKey, RolePagesResponse } from "@/lib/api/models";

/**
 * Test fikstürü: GERÇEK sözleşmedeki `PageKey` enum'undan (openapi.json) 100 sayfalık bir katalog ve rol
 * matrisi üretir — "100 anahtar" iddiaları elle yazılmış bir listeye değil sözleşmeye dayanır.
 */
const GROUP_BY_PREFIX: Record<string, { group: PageCatalogEntry["group"]; name: string; subgroup: string | null }> = {
  genel: { group: "genel", name: "Genel", subgroup: null },
  saha: { group: "saha", name: "Saha", subgroup: null },
  ik: { group: "ik", name: "İK", subgroup: null },
  planlama: { group: "planlama", name: "Planlama", subgroup: null },
  teklif: { group: "teklif", name: "Teklif ve Sözleşmeler", subgroup: null },
  stok: { group: "stok", name: "Stok & Satınalma", subgroup: null },
  mali: { group: "mali", name: "Mali", subgroup: null },
  proje: { group: "proje_ici", name: "Proje içi sekmeler", subgroup: "Proje" },
  santiye: { group: "proje_ici", name: "Proje içi sekmeler", subgroup: "Şantiye" },
  bolum: { group: "proje_ici", name: "Proje içi sekmeler", subgroup: "Bölüm" },
  ayarlar: { group: "ayarlar", name: "Ayarlar", subgroup: null },
};

const NAMES: Partial<Record<PageKey, string>> = {
  "genel.gosterge_paneli": "Gösterge Paneli",
  "genel.onay_kutusu": "Onay Kutusu",
  "saha.puantaj": "Puantaj",
  "saha.makine_kira": "Makine & Ekipman › Kira Hakedişi",
  "saha.gunluk_kayit": "Günlük Kayıt",
  "ik.personel": "Personel › Personel Listesi",
};

/** Onay eylemi olan sayfalar (fikstür alt kümesi). */
const APPROVAL_KEYS: readonly PageKey[] = ["genel.onay_kutusu", "saha.makine_kira", "saha.gunluk_kayit"];

export function pageKeysFromContract(): PageKey[] {
  const contract = JSON.parse(readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8")) as {
    components: { schemas: { PageKey: { enum: PageKey[] } } };
  };
  return contract.components.schemas.PageKey.enum;
}

export function buildCatalogFixture(): PageCatalogEntry[] {
  return pageKeysFromContract().map((key) => {
    const prefix = key.split(".")[0];
    const meta = GROUP_BY_PREFIX[prefix];
    return {
      key,
      name: NAMES[key] ?? key,
      group: meta.group,
      group_name: meta.name,
      subgroup: meta.subgroup,
      route: `/${key.replace(".", "/")}`,
      kind: meta.group === "proje_ici" ? "proje" : "sirket",
      has_approval: APPROVAL_KEYS.includes(key),
      twins: [],
      source: prefix,
    };
  });
}

/** Şantiye Şefi benzeri matris: saha "edit", gerisi "view"; Kira Hakedişi "view"; Onay Kutusu "edit"+onaylı. */
export function buildRolePagesFixture(
  roleId: string,
  overrides: { is_locked?: boolean; hidden_fields?: RolePagesResponse["hidden_fields"]; extra?: object } = {},
): RolePagesResponse {
  const pages: Record<string, PageGrant> = {};
  for (const key of pageKeysFromContract()) {
    pages[key] = { level: key.startsWith("saha.") ? "edit" : "view", approve: false };
  }
  pages["saha.makine_kira"] = { level: "view", approve: false };
  pages["genel.onay_kutusu"] = { level: "edit", approve: true };
  return {
    role_id: roleId,
    is_locked: overrides.is_locked ?? false,
    pages,
    hidden_fields: overrides.hidden_fields ?? ["maas_kisisel"],
    hidden_fields_effective: false,
    ...overrides.extra,
  };
}
