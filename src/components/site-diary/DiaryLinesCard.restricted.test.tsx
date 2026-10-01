import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiaryLinesCard, type DiaryLinesCardProps } from "./DiaryLinesCard";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import type { DiaryFormState } from "./form-state";

// DSC-F1.3 · kısıtlı kullanıcıda tüm liste boşsa ortak bildirim. GKS-F1.3:
// kayıt açılmamışken (önizleme) de aynı bildirim; eski "Önce Taslak Kaydet
// deyin" metni kalktı.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

const NO_BOQ_TEXT = "Bu şantiyede sözleşme BOQ pozu tanımlı değil — iş kalemi satırı üretilemedi.";
const OLD_NO_ENTRY_TEXT = /Önce “Taslak Kaydet” deyin/;

function renderCard(hasEntry: boolean) {
  const props: DiaryLinesCardProps = {
    entry: hasEntry ? ({ id: "e1", lines: [] } as unknown as SiteDiaryEntryDetail) : undefined,
    groups: [],
    sections: [],
    form: {} as DiaryFormState,
    onQuantityChange: vi.fn(),
    onOverrunReasonChange: vi.fn(),
    onAddLines: vi.fn(),
    onRemoveLine: vi.fn(),
    disabled: false,
    isLocked: false,
    canEditRows: true,
    isBoqUnavailable: false,
    isDirty: false,
    paymentsHref: "/x",
    boqHref: null,
    lineRefs: new Map(),
  };
  return render(<DiaryLinesCard {...props} />);
}

describe("DiaryLinesCard — kısıtlı boş durum (DSC-F1.3)", () => {
  beforeEach(() => {
    scope.value = { isRestricted: false, names: [] };
  });

  it("kısıtlı + kayıt açık + liste boş → ortak bildirim", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    renderCard(true);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(NO_BOQ_TEXT)).not.toBeInTheDocument();
  });

  it("kısıtlı + kayıt YOK (önizleme) + liste boş → aynı ortak bildirim; eski metin yok", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    renderCard(false);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(OLD_NO_ENTRY_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_BOQ_TEXT)).not.toBeInTheDocument();
  });

  it("atamasız + kayıt YOK (önizleme) + liste boş → BOQ yok metni", () => {
    renderCard(false);
    expect(screen.getByText(NO_BOQ_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(OLD_NO_ENTRY_TEXT)).not.toBeInTheDocument();
  });

  it("atamasız + kayıt açık + liste boş → bugünkü metin aynen", () => {
    renderCard(true);
    expect(screen.getByText(NO_BOQ_TEXT)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
