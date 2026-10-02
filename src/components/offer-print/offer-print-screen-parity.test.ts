// 🔴 TKL-F4.2b (c) · EKRAN grup Σ'sı ile PDF ara toplamı (işveren + iç) AYNI gruptan AYNI sayıyı basar.
// Ekran modeli `groupTotals` (offers/), PDF modelleri `print-model-*`: bu test üçünü tek grupta bağlar.
import { describe, expect, it } from "vitest";

import { groupTotals } from "@/components/offers/offer-items-model";
import { makeUnquantifiedItem } from "@/components/offers/offer-item-fixtures";

import { PRICED_UNIT_PRICE, makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { buildCustomerPrintModel } from "./print-model-customer";
import { buildInternalPrintModel } from "./print-model-internal";

const subtotalOf = <R extends { kind: string }>(pages: ReadonlyArray<{ parts: ReadonlyArray<{ rows: ReadonlyArray<R> }> }>): R => {
  const row = pages.flatMap((page) => page.parts.flatMap((part) => part.rows)).find((r) => r.kind === "subtotal");
  if (row === undefined) throw new Error("ara toplam satırı yok");
  return row;
};

describe("ekran ↔ PDF: yalnız miktarsız kalemli grup", () => {
  it("ekran amount '0' · işveren ara toplam '0,00' · iç ara toplam '0,00' / a-s '0'", () => {
    const group = makeGroup("g1", "Kaba İnşaat", 0, [{ id: "uq", groupId: "g1", poz: "UQ.1", unitPrice: PRICED_UNIT_PRICE, quantity: null }]);
    const revision = makePrintRevision({ groups: [group] });
    const screen = groupTotals([makeUnquantifiedItem({ id: "uq" })]);
    const customer = subtotalOf(buildCustomerPrintModel({ offer: makePrintOffer(), revision, company: makeCompany() }).pages);
    const internal = subtotalOf(buildInternalPrintModel({ offer: makePrintOffer(), revision, company: makeCompany() }).pages);
    expect(screen).toMatchObject({ amount: "0", manHours: "0" });
    expect(customer.amount).toBe("0,00");
    expect(internal.amount).toBe("0,00");
    expect(internal.manHours).toBe("0");
  });
});
