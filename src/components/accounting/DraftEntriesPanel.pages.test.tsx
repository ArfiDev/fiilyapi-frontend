import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { DraftEntriesPanel } from "./DraftEntriesPanel";
import type { JournalEntryResponse } from "@/lib/api/hooks/useJournalEntries";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — Kayıtlaştır = mali.yevmiye ONAYLAR · Düzenle/Storno = muhasebe sayfaları Düzenler (`canWrite`) ·
// taslak fiş Sil = YALNIZ sistem yöneticisi.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function entry(id: string, status: "draft" | "posted"): JournalEntryResponse {
  return {
    id,
    entry_date: "2026-09-02",
    description: `Fiş ${id}`,
    detail_note: null,
    total_debit: "1000.00",
    total_credit: "1000.00",
    status,
  } as unknown as JournalEntryResponse;
}

function renderPanel(canWrite: boolean) {
  return render(
    <DraftEntriesPanel
      entries={[entry("d1", "draft"), entry("p1", "posted")]}
      isLoading={false}
      canWrite={canWrite}
      writeDisabledReason="Yazma yetkiniz yok"
      busyEntryId={null}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onPost={vi.fn()}
      onReverse={vi.fn()}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("DraftEntriesPanel · sayfa izni kapıları (IZN-F2.x)", () => {
  it("mali.yevmiye Onaylar → Kayıtlaştır etkin; Sil SA olmadığı için PASİF", () => {
    session(meFixture({ pages: { "mali.yevmiye": pageGrant("edit", true) } }));
    renderPanel(true);
    expect(screen.getByTestId("mu-draft-post-d1")).toBeEnabled();
    expect(screen.getByTestId("mu-draft-delete-d1")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-edit-d1")).toBeEnabled();
    expect(screen.getByTestId("mu-draft-reverse-p1")).toBeEnabled();
  });

  it("mali.yevmiye Düzenler (Onaylar YOK) → Kayıtlaştır PASİF, Düzenle/Storno etkin", () => {
    session(meFixture({ pages: { "mali.yevmiye": pageGrant("edit") } }));
    renderPanel(true);
    expect(screen.getByTestId("mu-draft-post-d1")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-edit-d1")).toBeEnabled();
    expect(screen.getByTestId("mu-draft-reverse-p1")).toBeEnabled();
  });

  it("yalnız Görür (canWrite false) → Düzenle ve Storno pasif", () => {
    session(meFixture({ pages: { "mali.yevmiye": pageGrant("view") } }));
    renderPanel(false);
    expect(screen.getByTestId("mu-draft-edit-d1")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-reverse-p1")).toBeDisabled();
  });

  it("sistem yöneticisi → Sil ve Kayıtlaştır etkin", () => {
    session(meFixture({ pages: { "mali.yevmiye": pageGrant("none") }, isSystemAdmin: true }));
    renderPanel(true);
    expect(screen.getByTestId("mu-draft-delete-d1")).toBeEnabled();
    expect(screen.getByTestId("mu-draft-post-d1")).toBeEnabled();
  });

  it("pages boş → eski davranış: canWrite hepsini belirler", () => {
    session(meFixture({ pages: {}, permissions: { accounting: "full" } }));
    const { unmount } = renderPanel(true);
    expect(screen.getByTestId("mu-draft-post-d1")).toBeEnabled();
    expect(screen.getByTestId("mu-draft-delete-d1")).toBeEnabled();
    unmount();
    renderPanel(false);
    expect(screen.getByTestId("mu-draft-post-d1")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-delete-d1")).toBeDisabled();
  });
});
