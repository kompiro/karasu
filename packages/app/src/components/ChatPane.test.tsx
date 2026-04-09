// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { ChatPane } from "./ChatPane.js";

describe("ChatPane", () => {
  it("shows the given scopeLabel in the scope indicator", () => {
    const { getByText } = render(<ChatPane scopeLabel="Root" sessionResetKey={null} />);
    expect(getByText(/📍 Root/)).toBeTruthy();
  });

  it("shows label-based scope indicator", () => {
    const { getByText } = render(
      <ChatPane scopeLabel="EC Platform > EC サイト" sessionResetKey={null} />,
    );
    expect(getByText(/📍 EC Platform > EC サイト/)).toBeTruthy();
  });

  it("submitting via form submit adds message to the list", () => {
    const { getByLabelText, getByText } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(getByText("Hello")).toBeTruthy();
  });

  it("Cmd+Enter submits the message", () => {
    const { getByLabelText, getByText } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(getByText("Hello")).toBeTruthy();
  });

  it("Ctrl+Enter submits the message", () => {
    const { getByLabelText, getByText } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(getByText("Hello")).toBeTruthy();
  });

  it("plain Enter does not submit the message", () => {
    const { getByLabelText, queryByText } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(queryByText("Hello", { selector: ".chat-message-content" })).toBeNull();
  });

  it("Send button is disabled when input is empty", () => {
    const { getByRole } = render(<ChatPane scopeLabel="Root" sessionResetKey={null} />);
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", true);
  });

  it("Send button is enabled when input has text", () => {
    const { getByLabelText, getByRole } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
    );
    fireEvent.change(getByLabelText("Chat message input"), { target: { value: "Hi" } });
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", false);
  });

  it("New Session button clears messages", () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ChatPane scopeLabel="Root" sessionResetKey={null} />,
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
      <ChatPane scopeLabel="Root" sessionResetKey="project-a" />,
    );
    const input = getByLabelText("Chat message input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(getByText("Hello")).toBeTruthy();

    rerender(<ChatPane scopeLabel="Root" sessionResetKey="project-b" />);
    expect(queryByText("Hello")).toBeNull();
  });

  it("scope indicator updates when scopeLabel prop changes", () => {
    const { getByText, rerender } = render(
      <ChatPane scopeLabel="システム A" sessionResetKey={null} />,
    );
    expect(getByText(/📍 システム A/)).toBeTruthy();

    rerender(<ChatPane scopeLabel="システム A > サービス B" sessionResetKey={null} />);
    expect(getByText(/📍 システム A > サービス B/)).toBeTruthy();
  });
});
