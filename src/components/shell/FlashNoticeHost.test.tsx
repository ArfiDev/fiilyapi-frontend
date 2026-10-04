import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FlashNoticeHost } from "./FlashNoticeHost";
import { dismissFlashNotice, showFlashNotice } from "./flash-notice";

beforeEach(() => {
  dismissFlashNotice();
});

describe("FlashNoticeHost", () => {
  it("bildirim yokken DOM'a hiçbir şey basmaz", () => {
    const { container } = render(<FlashNoticeHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it("bildirimi status olarak basar ve Kapat ile kaldırır", async () => {
    render(<FlashNoticeHost />);
    act(() => showFlashNotice("Şantiye silindi: Kule"));

    expect(screen.getByRole("status")).toHaveTextContent("Şantiye silindi: Kule");
    await userEvent.setup().click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByTestId("flash-notice")).not.toBeInTheDocument();
  });
});
