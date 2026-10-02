import { describe, expect, it } from "vitest";

import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";

import { createFakeBackend } from "./template-fake-backend.testkit";

/**
 * TKL-F4.6b · sahte backend gerçeğe HİZALI mı: kimlik yeniden üretimi (`_replace_rows`) yalnız PUT'ta olur.
 * Kimlik değişimine dayanan ekran testleri (Y1/O1/O4) bu davranışa BAĞLIDIR; sahte backend kör kalırsa burada kırılır.
 */
const PATH = { params: { path: { template_id: "tpl-a" } } };
const CONTENT = "/offers/templates/{template_id}/content";
const DETAIL = "/offers/templates/{template_id}";

function make() {
  return createFakeBackend({
    templates: [
      { id: "tpl-a", name: "A", description: null, overhead_pct: null, profit_pct: null, is_default: false, usage_count: 0, groups: [{ name: "Betonarme", items: ["c1", "c2"] }, { name: "Kalıp", items: [] }] },
    ],
  });
}

function read(fake: ReturnType<typeof make>): OfferTemplateDetail {
  return (fake.handle("GET", DETAIL, PATH) as { data: OfferTemplateDetail }).data;
}

const idsOf = (detail: OfferTemplateDetail) => detail.groups.flatMap((group) => [group.id, ...group.items.map((item) => item.id)]);
const body = (fake: ReturnType<typeof make>) => ({
  groups: [{ name: "Betonarme", items: [{ catalog_item_id: "c1" }, { catalog_item_id: "c2" }] }, { name: "Kalıp", items: [] }],
  expected_updated_at: fake.row("tpl-a")?.updated_at,
});

describe("sahte backend kimlik davranışı", () => {
  it("🔴 GET, PATCH ve 'varsayılan yap' grup/kalem kimliklerini KORUR", () => {
    const fake = make();
    const before = idsOf(read(fake));
    expect(idsOf(read(fake))).toEqual(before);
    fake.handle("PATCH", DETAIL, { ...PATH, body: { name: "B", expected_updated_at: fake.row("tpl-a")?.updated_at } });
    fake.handle("POST", "/offers/templates/{template_id}/default", PATH);
    expect(idsOf(read(fake))).toEqual(before);
  });

  it("🔴 PUT içerik AYNI kalsa bile TÜM grup ve kalem kimliklerini YENİDEN üretir (backend `_replace_rows`)", () => {
    const fake = make();
    const before = idsOf(read(fake));
    fake.handle("PUT", CONTENT, { ...PATH, body: body(fake) } as never);
    const after = idsOf(read(fake));
    expect(after).toHaveLength(before.length);
    expect(after.filter((id) => before.includes(id))).toEqual([]);
  });
});
