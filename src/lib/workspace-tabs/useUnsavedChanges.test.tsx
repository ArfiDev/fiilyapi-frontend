import { describe, expect, it, afterEach } from "vitest";
import { render, renderHook, cleanup, act } from "@testing-library/react";
import { StrictMode } from "react";

import { unsavedRegistry } from "./unsaved-registry";
import { useHasUnsavedChanges, useUnsavedChanges } from "./useUnsavedChanges";

// Kayıt tek örnektir (module-level); her testten SONRA render edilen ağaçları
// UNMOUNT ederek temizle (izolasyon) — hook'un kendi temizlik efekti kaydı
// boşaltır, bir sonraki test boş bir kayıtla başlar.
afterEach(() => {
  cleanup();
  expect(unsavedRegistry.hasUnsaved()).toBe(false);
});

function Probe({ isDirty, label }: { isDirty: boolean; label?: string }) {
  useUnsavedChanges(isDirty, label);
  const hasUnsaved = useHasUnsavedChanges();
  return <span data-testid="probe">{hasUnsaved ? "kirli" : "temiz"}</span>;
}

describe("useUnsavedChanges", () => {
  it("isDirty true iken kayıt olur, false olunca silinir", () => {
    const { rerender } = renderHook(({ isDirty }: { isDirty: boolean }) => useUnsavedChanges(isDirty, "Test"), {
      initialProps: { isDirty: false },
    });
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    act(() => rerender({ isDirty: true }));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    act(() => rerender({ isDirty: false }));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("UNMOUNT olunca kayıt silinir", () => {
    const { unmount } = renderHook(() => useUnsavedChanges(true, "Test"));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("iki bileşen aynı anda kayıtlı olabilir; biri unmount olunca diğeri kalır", () => {
    const first = renderHook(() => useUnsavedChanges(true, "Birinci"));
    const second = renderHook(() => useUnsavedChanges(true, "İkinci"));
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    first.unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    expect(unsavedRegistry.labels()).toEqual(["İkinci"]);

    second.unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("StrictMode çift efektinde sızıntı yok — unmount sonrası kayıt boştur", () => {
    const { unmount } = render(
      <StrictMode>
        <Probe isDirty label="StrictMode" />
      </StrictMode>,
    );
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    unmount();
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("useHasUnsavedChanges gerçek zamanlı görünür bileşende `true`/`false` yansır", () => {
    const { getByTestId, rerender } = render(<Probe isDirty={false} />);
    expect(getByTestId("probe").textContent).toBe("temiz");

    rerender(<Probe isDirty />);
    expect(getByTestId("probe").textContent).toBe("kirli");

    rerender(<Probe isDirty={false} />);
    expect(getByTestId("probe").textContent).toBe("temiz");
  });
});
