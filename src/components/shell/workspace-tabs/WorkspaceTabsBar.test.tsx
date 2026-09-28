import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import type { WorkspaceTabsStripProps } from "./WorkspaceTabsStrip";
import { WorkspaceTabsBar } from "./WorkspaceTabsBar";

/**
 * `WorkspaceTabsBar` yalnız BAĞLAMADIR: denetleyicinin durumunu ve
 * eylemlerini şeride iletir, onay modalını basar. Şeridin kendi davranışı
 * (F1.4b) burada sahte ile değiştirilir — son alınan props'lar yakalanır.
 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u-1" }, isLoading: false }),
}));
let lastProps: WorkspaceTabsStripProps | null = null;
vi.mock("./WorkspaceTabsStrip", () => ({
  WorkspaceTabsStrip: (props: WorkspaceTabsStripProps) => {
    lastProps = props;
    return (
      <div data-testid="fake-strip">
        {props.tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => props.onSelect(t.id)}>
            {t.title}
          </button>
        ))}
      </div>
    );
  },
}));

beforeEach(() => {
  workspaceTabsStore.detachUser();
  unsavedRegistry.set("dirty-test", null);
  pushMock.mockReset();
  lastProps = null;
});

describe("WorkspaceTabsBar — bağlama", () => {
  it("şeride mağazanın sekmelerini ve aktif kimliğini iletir", () => {
    act(() => workspaceTabsStore.dispatch(openTab, { url: "/projeler" }));
    render(<WorkspaceTabsBar />);
    expect(lastProps?.tabs.map((t) => t.url)).toEqual(["/", "/projeler"]);
    expect(lastProps?.activeId).toBe(workspaceTabsStore.getSnapshot().tabs[1].id);
  });

  it("şeritte seçim → push; dirty varken → modal, 'at ve geç' → push", async () => {
    act(() => workspaceTabsStore.dispatch(openTab, { url: "/projeler" }));
    render(<WorkspaceTabsBar />);
    act(() => unsavedRegistry.set("dirty-test", { label: "Puantaj" }));
    await userEvent.click(screen.getByRole("button", { name: "Gösterge Paneli" }));
    expect(screen.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri at ve geç" }));
    expect(pushMock).toHaveBeenCalledWith("/");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("şerit eylemlerinin hepsi denetleyiciye bağlıdır (kapat/diğerleri/sağdakiler/tümü/sırala)", () => {
    act(() => {
      workspaceTabsStore.dispatch(openTab, { url: "/projeler" });
      workspaceTabsStore.dispatch(openTab, { url: "/hazine" });
      workspaceTabsStore.dispatch(openTab, { url: "/puantaj" });
    });
    render(<WorkspaceTabsBar />);
    const [, a, b, c] = workspaceTabsStore.getSnapshot().tabs.map((t) => t.id);

    act(() => lastProps!.onReorder(c, 1));
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.id)).toEqual(["panel", c, a, b]);
    act(() => lastProps!.onClose(a));
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.id)).toEqual(["panel", c, b]);
    act(() => lastProps!.onCloseRight(c));
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.id)).toEqual(["panel", c]);
    act(() => lastProps!.onCloseOthers("panel"));
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.id)).toEqual(["panel"]);
    act(() => workspaceTabsStore.dispatch(openTab, { url: "/hazine" }));
    act(() => lastProps!.onCloseAll());
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.id)).toEqual(["panel"]);
  });
});
