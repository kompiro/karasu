// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { ChatPane } from "./ChatPane.js";

describe("ChatPane", () => {
  it("shows root scope when viewPath is empty", () => {
    const { getByText } = render(<ChatPane viewPath={[]} sessionResetKey={null} />);
    expect(getByText(/📍 Root/)).toBeTruthy();
  });

  it("shows joined viewPath as scope indicator", () => {
    const { getByText } = render(
      <ChatPane viewPath={["ECPlatform", "ECommerce"]} sessionResetKey={null} />,
    );
    expect(getByText(/📍 ECPlatform > ECommerce/)).toBeTruthy();
  });

  it("submitting a message adds it to the list", () => {
    const { getByLabelText, getByText } = render(<ChatPane viewPath={[]} sessionResetKey={null} />);
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(getByText("Hello")).toBeTruthy();
  });

  it("Send button is disabled when input is empty", () => {
    const { getByRole } = render(<ChatPane viewPath={[]} sessionResetKey={null} />);
    const sendBtn = getByRole("button", { name: /Send/ });
    expect(sendBtn).toHaveProperty("disabled", true);
  });

  it("Send button is enabled when input has text", () => {
    const { getByLabelText, getByRole } = render(<ChatPane viewPath={[]} sessionResetKey={null} />);
    fireEvent.change(getByLabelText("Chat message input"), { target: { value: "Hi" } });
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", false);
  });

  it("New Session button clears messages", () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ChatPane viewPath={[]} sessionResetKey={null} />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(getByText("Hello")).toBeTruthy();

    fireEvent.click(getByText(/New Session/));
    expect(queryByText("Hello")).toBeNull();
  });

  it("session resets when sessionResetKey changes", () => {
    const { getByLabelText, getByText, queryByText, rerender } = render(
      <ChatPane viewPath={[]} sessionResetKey="project-a" />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(getByText("Hello")).toBeTruthy();

    rerender(<ChatPane viewPath={[]} sessionResetKey="project-b" />);
    expect(queryByText("Hello")).toBeNull();
  });

  it("scope indicator updates when viewPath prop changes", () => {
    const { getByText, rerender } = render(
      <ChatPane viewPath={["SystemA"]} sessionResetKey={null} />,
    );
    expect(getByText(/📍 SystemA/)).toBeTruthy();

    rerender(<ChatPane viewPath={["SystemA", "ServiceB"]} sessionResetKey={null} />);
    expect(getByText(/📍 SystemA > ServiceB/)).toBeTruthy();
  });
});
