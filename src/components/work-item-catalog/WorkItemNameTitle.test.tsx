import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BETON, LAST_SZL } from "@/components/work-item-catalog/work-item-fixtures";
import { WorkItemPickerRow } from "@/components/work-item-picker/WorkItemPickerRow";
import { CONTRACT_RULES } from "@/components/work-item-picker/picker-rules";

import { WorkItemRow } from "./WorkItemRow";

// KAT-F1.4c: 2 satırda kırpılan ad, tam metniyle `title`da kalır.
const LONG_NAME = `${"Ø 16 mm nervürlü beton çelik çubuğu temini ".repeat(5)}sonu`;

describe("uzun ad — tam metin title'da", () => {
  it("katalog satırı: wik-name title = tam ad", () => {
    render(<WorkItemRow item={{ ...BETON, name: LONG_NAME }} now={new Date("2026-09-24")} canWrite={false} onEdit={vi.fn()} />);
    expect(screen.getByText(LONG_NAME)).toHaveAttribute("title", LONG_NAME);
  });

  it("seçici satırı: wip-name title = tam ad", () => {
    render(
      <table>
        <tbody>
          <WorkItemPickerRow
            row={{ item: { ...LAST_SZL, name: LONG_NAME }, block: null }}
            input={undefined}
            error={null}
            amountText={null}
            rules={CONTRACT_RULES}
            priceAriaSuffix="birim fiyat"
            isDisabled={false}
            onToggle={vi.fn()}
            onQuantity={vi.fn()}
            onUnitPrice={vi.fn()}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText(LONG_NAME)).toHaveAttribute("title", LONG_NAME);
  });
});
