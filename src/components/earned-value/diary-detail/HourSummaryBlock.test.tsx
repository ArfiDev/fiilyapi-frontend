import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PF_BANDS } from "@/lib/earned-value";

import { buildCodeIndex } from "../diary/code-tree";
import { SEC_K610, codeTree, dayView } from "../diary/diary-fixtures";
import { hourSummary } from "./detail-progress";
import { HourSummaryBlock } from "./HourSummaryBlock";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

function footerTotalText(view: ReturnType<typeof dayView>): string | null | undefined {
  const summary = hourSummary(view, buildCodeIndex(codeTree()), SEC_K610);
  const { container } = render(
    <HourSummaryBlock view={view} summary={summary} bands={DEFAULT_PF_BANDS} currentSectionName="Kat 6–10" openHref={undefined} />,
  );
  return container.querySelector("tfoot .ev-detail-hours__num")?.textContent;
}

describe("HourSummaryBlock — Toplam hücresi GÖRÜNEN satırların toplamıdır (kısıtlı kullanıcıda başka disiplin payı hariç)", () => {
  it("atamasız: Toplam = sunucu allocated_hours (18)", () => {
    expect(footerTotalText(dayView())).toBe("18");
  });

  it("kısıtlı (allocated 30, görünen hücre 18): Toplam 18 — 30 DEĞİL; dağıtılmamış sunucu değeri (54)", () => {
    const view = dayView({ totals: { source_hours: "84.00", allocated_hours: "30.00", unallocated_hours: "54.00" } });
    expect(footerTotalText(view)).toBe("18");
    const summary = hourSummary(view, buildCodeIndex(codeTree()), SEC_K610);
    const { container } = render(
      <HourSummaryBlock view={view} summary={summary} bands={DEFAULT_PF_BANDS} currentSectionName="Kat 6–10" openHref={undefined} />,
    );
    expect(container.querySelector("tfoot .ev-detail-hours__unallocated")?.textContent).toBe("54 a-s dağıtılmamış");
  });
});
