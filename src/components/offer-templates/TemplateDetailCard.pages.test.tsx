import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { TemplateDetailCard } from "./TemplateDetailCard";
import type { OfferTemplateDetail } from "@/lib/api/hooks/useOfferTemplates";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — şablon SİLME yalnız sistem yöneticisi (backend SIL-B1 `require_system_admin`); Kopyala `canWrite` kararındadır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DETAIL = {
  id: "tpl-1",
  name: "Kaba inşaat",
  description: "Standart set",
  is_default: false,
  item_count: 4,
  group_count: 2,
  overhead_pct: "10",
  profit_pct: "8",
} as unknown as OfferTemplateDetail;

function renderCard() {
  return render(
    <TemplateDetailCard
      detail={DETAIL}
      usageCount={1}
      defaults={null}
      canWrite
      isBusy={false}
      onPatch={vi.fn()}
      onMakeDefault={vi.fn()}
      onCopy={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe("TemplateDetailCard · silme = yalnız SA (IZN-F2.x)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Düzenler (SA değil) → Kopyala var, Sil YOK", () => {
    session(meFixture({ pages: { "teklif.sablonlar": pageGrant("edit", true) } }));
    renderCard();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("sistem yöneticisi → Sil var", () => {
    session(meFixture({ pages: { "teklif.sablonlar": pageGrant("edit") }, isSystemAdmin: true }));
    renderCard();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  // IZN-F6a · modül-izni düşüşü KALKTI: grant yoksa kapı KAPALI (fail-closed).
  it("pages boş → Sil YOK (modül full olsa da)", () => {
    session(meFixture({ pages: {} }));
    renderCard();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });
});
