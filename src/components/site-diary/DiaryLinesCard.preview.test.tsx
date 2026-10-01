import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DiaryLinesCard, type DiaryLinesCardProps } from "./DiaryLinesCard";
import { buildDiaryLineTree } from "./diary-lines-tree";
import { emptyDiaryForm } from "./form-state";

// GKS-F1.3 · kart kayıt yokken önizleme kaynağından beslenir: tfoot toplamı,
// pasif × (Ü4), Ü1 / Ü11 metinleri. Ekran akışı `SiteDiaryEntryView.preview.test`te.
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => ({ isRestricted: false, names: [] }) }));

const FORM = emptyDiaryForm("2026-09-24");
const SKELETON_LINE = {
  boq_item_id: "bi-1",
  section_id: null,
  code: "03.001",
  description: "C25/30 Beton",
  unit: "m³",
  unit_price: "1520.00",
  quantity: "0.000",
  cumulative_quantity: "900.000",
  leaf_cumulative_quantity: "900.000",
  planned_quantity: "1000.000",
  remaining_quantity: "100.000",
  overrun_reason: null,
  line_amount: "0.00",
  section_name: null,
};

function renderCard(overrides: Partial<DiaryLinesCardProps> = {}, lines = [SKELETON_LINE]) {
  const groups = buildDiaryLineTree({ lines, form: FORM, boqItems: [], sections: [], isPreview: true });
  const props: DiaryLinesCardProps = {
    entry: undefined,
    groups,
    sections: [],
    form: FORM,
    onQuantityChange: vi.fn(),
    onOverrunReasonChange: vi.fn(),
    onAddLines: vi.fn(),
    onRemoveLine: vi.fn(),
    disabled: false,
    isLocked: false,
    canEditRows: true,
    isBoqUnavailable: false,
    isDirty: false,
    paymentsHref: "/hakedis",
    boqHref: "/is-kalemleri",
    lineRefs: new Map(),
    ...overrides,
  };
  return render(<DiaryLinesCard {...props} />);
}

describe("DiaryLinesCard · önizleme", () => {
  it("hasRows ağaç kaynağından: kayıt yokken de tablo basılır", () => {
    renderCard();
    expect(screen.getByLabelText("03.001 bugün yapılan miktar")).toBeInTheDocument();
  });

  it("tfoot toplamı linesTotal prop'undan (önizleme)", () => {
    renderCard({ linesTotal: "4321.50" });
    expect(screen.getByText(/4\.321,5/)).toBeInTheDocument();
  });

  it("iskelet satırı × pasif + Ü4 title", () => {
    renderCard();
    const remove = screen.getByRole("button", { name: "03.001 · Bölümsüz satırını kaldır" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute("title", "İskelet satırıdır, kaydedilmeden kaldırılamaz");
  });

  it("Ü1 · bölüm seçili ve satır yok → metin + tahsis bağlantısı", () => {
    renderCard({ hasSection: true }, []);
    expect(screen.getByText("Bu bölüme tahsis edilmiş iş kalemi yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İş Kalemleri'nde tahsis et →" })).toHaveAttribute("href", "/is-kalemleri");
  });

  it("Ü1 · boqHref yoksa bağlantı basılmaz (çift slaşlı yol olmasın)", () => {
    renderCard({ hasSection: true, boqHref: null }, []);
    expect(screen.getByText("Bu bölüme tahsis edilmiş iş kalemi yok.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tahsis et/ })).not.toBeInTheDocument();
  });

  it("Ü11 · yükleniyor: tablo yok, metin var", () => {
    renderCard({ previewStatus: "loading" }, []);
    expect(screen.getByText("İş kalemleri yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText(/BOQ pozu tanımlı değil/)).not.toBeInTheDocument();
  });

  it("Ü11 · hata: metin + 'Tekrar dene' yeniden dener", async () => {
    const onRetryPreview = vi.fn();
    renderCard({ previewStatus: "error", onRetryPreview }, []);
    expect(screen.getByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(onRetryPreview).toHaveBeenCalledTimes(1);
  });

  it("GKS-F1.4.1 · hata: 'Tekrar dene' kırmızı bandın İÇİNDE (diary__error emsali)", () => {
    renderCard({ previewStatus: "error", onRetryPreview: vi.fn() }, []);
    const band = screen.getByText("İş kalemleri yüklenemedi").closest(".diary__error");
    expect(band).not.toBeNull();
    expect(band).toContainElement(screen.getByRole("button", { name: "Tekrar dene" }));
  });
});
