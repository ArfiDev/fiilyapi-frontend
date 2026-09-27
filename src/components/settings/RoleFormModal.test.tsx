import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { RoleFormModal } from "./RoleFormModal";
import { useCreateRole, useRenameRole } from "@/lib/api/hooks/useRoleMutations";
import type { RoleResponse } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useRoleMutations", () => ({
  useCreateRole: vi.fn(),
  useRenameRole: vi.fn(),
}));

const createRole = vi.fn();
const renameRole = vi.fn();

const ROLE: RoleResponse = {
  id: "r-1",
  key: "saha_muduru",
  name: "Saha Müdürü",
  emoji: "🏗️",
  description: "Şantiye sorumlusu",
  is_system: false,
} as RoleResponse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateRole).mockReturnValue({ mutate: createRole, isPending: false } as never);
  vi.mocked(useRenameRole).mockReturnValue({ mutate: renameRole, isPending: false } as never);
});

describe("RoleFormModal — kaydedilmemiş değişiklik kaydı (create)", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<RoleFormModal mode="create" onClose={() => {}} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ad yazıldı → true", async () => {
    render(<RoleFormModal mode="create" onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Ad"), "Yeni Rol");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", async () => {
    createRole.mockImplementation((_input, opts) => opts?.onSuccess?.());
    const onClose = vi.fn();
    const { unmount } = render(<RoleFormModal mode="create" onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Anahtar (key)"), "yeni_rol");
    await userEvent.type(screen.getByLabelText("Ad"), "Yeni Rol");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});

describe("RoleFormModal — kaydedilmemiş değişiklik kaydı (edit)", () => {
  it("mevcut rolle açıldı + dokunulmadı → false (taban `role` prop'undan)", () => {
    render(<RoleFormModal mode="edit" role={ROLE} onClose={() => {}} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("ad değişti → true", async () => {
    render(<RoleFormModal mode="edit" role={ROLE} onClose={() => {}} />);
    const name = screen.getByLabelText("Ad");
    await userEvent.clear(name);
    await userEvent.type(name, "Şantiye Şefi");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });
});
