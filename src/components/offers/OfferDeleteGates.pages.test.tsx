import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { OfferGroupHeaderRow } from "./OfferGroupHeaderRow";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — teklif grubu silme yalnız sistem yöneticisi (SIL-B1 `require_system_admin`).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderRow() {
  return render(
    <table>
      <tbody>
        <OfferGroupHeaderRow code="A" groupId="g1" name="Kaba" items={[]} canEdit onRename={vi.fn()} onDelete={vi.fn()} />
      </tbody>
    </table>,
  );
}

const DELETE = "Kaba grubunu sil";

describe("OfferGroupHeaderRow · boş grubu silme = yalnız SA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Düzenler (SA değil) → silme düğmesi YOK", () => {
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("edit", true) } }));
    renderRow();
    expect(screen.queryByRole("button", { name: DELETE })).toBeNull();
  });

  it("sistem yöneticisi → var", () => {
    session(meFixture({ pages: { "teklif.teklif_hazirlama": pageGrant("edit") }, isSystemAdmin: true }));
    renderRow();
    expect(screen.getByRole("button", { name: DELETE })).toBeInTheDocument();
  });

  // IZN-F6a · modül-izni düşüşü KALKTI: grant yoksa kapı KAPALI (fail-closed).
  it("pages boş → Sil YOK", () => {
    session(meFixture({ pages: {} }));
    renderRow();
    expect(screen.queryByRole("button", { name: DELETE })).toBeNull();
  });
});
