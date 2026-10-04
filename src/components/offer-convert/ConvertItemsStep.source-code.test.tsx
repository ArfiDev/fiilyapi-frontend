import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { makeGroup, makeItem } from "@/components/offers/offer-item-fixtures";
import { BETON, KAT_BOTH } from "@/components/work-item-catalog/work-item-fixtures";

import { ConvertItemsStep } from "./ConvertItemsStep";
import { DISCIPLINE_BY_CATALOG, makeWonRevision } from "./convert-fixtures";
import { summarize } from "./convert-derive";
import { addFromCatalog, rowsFromRevision } from "./convert-model";
import type { ConvertDraft } from "./convert-types";

const OFFER_CODE = "15.150.1003";

function renderStep(draft: ConvertDraft) {
  const actions = { onToggle: vi.fn(), onQty: vi.fn(), onBf: vi.fn(), onCode: vi.fn(), onRename: vi.fn(), onDiscipline: vi.fn() };
  render(
    <ConvertItemsStep
      draft={draft}
      summary={summarize(draft, "20.00")}
      revNo={2}
      vatPct="20.00"
      errors={{ general: {}, groups: {}, rows: {} }}
      isSiteOpen
      disciplines={[]}
      isLocked={false}
      onOpenCatalog={vi.fn()}
      actions={actions}
    />,
  );
}
const rowOf = (key: string) => screen.getByTestId(`convert-row-${key}`);
const subOf = (key: string) => within(rowOf(key)).queryByTestId(`convert-source-code-${key}`);

describe("KAT-F2.2 · dönüştürme ekranı: Bakanlık poz no'su (Q5)", () => {
  it("teklif kaleminin kodu kod hücresinin altında görünür (salt okuma, ekran kipi); kodsuz satırda YOK", () => {
    const revision = makeWonRevision({
      groups: [makeGroup("g-a", "KABA", 0, [makeItem({ id: "it-1", source_code: OFFER_CODE }), makeItem({ id: "it-2", poz_no: "KAB-0002", source_code: null })])],
    });
    renderStep(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG));
    const sub = subOf("o:it-1");
    expect(sub).toHaveTextContent(OFFER_CODE);
    expect(sub).toHaveAttribute("title", OFFER_CODE);
    expect(sub).not.toHaveClass("source-code-sub--print");
    expect(subOf("o:it-2")).toBeNull();
  });

  it("katalogtan eklenen satır WorkItemRead.source_code'unu taşır ve gösterir", () => {
    const base = rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG);
    const draft = addFromCatalog(base, "g:g-ince", [KAT_BOTH]);
    renderStep(draft);
    expect(subOf("n:0")).toHaveTextContent(KAT_BOTH.source_code as string);
  });

  it("kod düzenlenebilirken (çakışma) alt satır input'un ALTINDA salt okuma; input değeri poz no", () => {
    const revision = makeWonRevision({
      groups: [
        makeGroup("g-a", "KABA", 0, [
          makeItem({ id: "it-1", source_code: OFFER_CODE }),
          makeItem({ id: "it-9", source_code: "15.250.1011" }),
        ]),
      ],
    });
    renderStep(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG));
    const row = rowOf("o:it-1");
    const input = within(row).getByLabelText("Poz no");
    expect(input).toHaveValue(BETON.poz_no);
    const sub = subOf("o:it-1") as HTMLElement;
    expect(sub).toHaveTextContent(OFFER_CODE);
    expect(sub.tagName).not.toBe("INPUT");
    expect(input.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
