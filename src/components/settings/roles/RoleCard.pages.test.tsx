import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { RoleCard } from "./RoleCard";
import type { RoleResponse } from "@/lib/api/models";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — rol SİL = yalnız sistem yöneticisi (kullanıcısız/kilitsiz durum kuralı korunur);
// Kopyala = ayarlar.rol_yonetimi Düzenler.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const ROLE = {
  id: "role-1",
  key: "custom_role",
  name: "Özel Rol",
  emoji: "🧰",
  description: "Deneme rolü",
  user_count: 0,
  is_locked: false,
} as unknown as RoleResponse;

function renderCard(role: RoleResponse = ROLE) {
  return render(<RoleCard role={role} onCopy={vi.fn()} onDelete={vi.fn()} />);
}

beforeEach(() => vi.clearAllMocks());

describe("RoleCard · sayfa izni kapıları (IZN-F2.x)", () => {
  it("rol yönetimi Düzenler (SA değil) → Kopyala var, Sil YOK", () => {
    session(meFixture({ pages: { "ayarlar.rol_yonetimi": pageGrant("edit", true) } }));
    renderCard();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("yalnız Görür → Kopyala YOK, Sil YOK", () => {
    session(meFixture({ pages: { "ayarlar.rol_yonetimi": pageGrant("view") } }));
    renderCard();
    expect(screen.queryByRole("button", { name: "Kopyala" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("sistem yöneticisi → Sil var; kullanıcılı rolde durum kuralı yine Sil'i gizler", () => {
    session(meFixture({ pages: { "ayarlar.rol_yonetimi": pageGrant("view") }, isSystemAdmin: true }));
    const { unmount } = renderCard();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
    unmount();
    renderCard({ ...ROLE, user_count: 3 } as RoleResponse);
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("pages boş → eski davranış: Sil ve Kopyala görünür", () => {
    session(meFixture({ pages: {} }));
    renderCard();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
  });
});
