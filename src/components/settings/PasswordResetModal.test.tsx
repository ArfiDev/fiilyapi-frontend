import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { PasswordResetModal } from "./PasswordResetModal";
import { useResetPassword } from "@/lib/api/hooks/useUserMutations";
import type { UserResponse } from "@/lib/api/models";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/useUserMutations", () => ({ useResetPassword: vi.fn() }));

const reset = vi.fn();
const USER = { id: "u-1", full_name: "Ayşe Yılmaz" } as UserResponse;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useResetPassword).mockReturnValue({
    mutate: reset,
    isPending: false,
  } as never);
});

/**
 * SEKME-F1.3b · KURAL 7: `settings/Modal`'a `isDirty` VERİLMEZ, doğrudan
 * `useUnsavedChanges(password.length > 0, ...)` bağlanır.
 */
describe("PasswordResetModal — kaydedilmemiş değişiklik kaydı", () => {
  it("açıldı + dokunulmadı → false", () => {
    render(<PasswordResetModal user={USER} onClose={() => {}} />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("parola yazıldı → true", async () => {
    render(<PasswordResetModal user={USER} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Yeni Parola"), "yeniparola1");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess: onClose) → unmount ile false", async () => {
    reset.mockImplementation((_input, opts) => opts?.onSuccess?.());
    const onClose = vi.fn();
    const { unmount } = render(<PasswordResetModal user={USER} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Yeni Parola"), "yeniparola1");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Sıfırla" }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
