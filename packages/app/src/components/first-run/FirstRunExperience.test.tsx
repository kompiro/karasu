// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExampleProject, Project } from "@karasu-tools/core";
import { LocaleProvider } from "../../i18n/index.js";
import { CommandProvider } from "../../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../../keyboard/KeyboardShortcutDispatcher.js";
import type { AppAction } from "../../state/app-reducer.js";
import { requestReveal } from "../../state/preview-reveal.js";
import { CommandPalette } from "../CommandPalette.js";
import { FirstRunExperience } from "./FirstRunExperience.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  requestReveal(null);
});

const stamp = { createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
const gettingStarted: Project = {
  id: "gs",
  name: "getting-started",
  rootPath: "/projects/gs",
  ...stamp,
};
const copy: Project = { id: "tour", name: "service-split", rootPath: "/projects/tour", ...stamp };

/** A sample open that resolves only when the test says so. */
function deferredOpen() {
  let resolve: (project: Project | null) => void = () => {};
  const openBundledExample = vi.fn<(example: ExampleProject) => Promise<Project | null>>(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  return { openBundledExample, resolve: (p: Project | null) => resolve(p) };
}

function setup(openBundledExample: (example: ExampleProject) => Promise<Project | null>) {
  return render(
    <LocaleProvider initialLocale="en">
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <CommandPalette />
        <FirstRunExperience
          seededDefaults={false}
          initialLocation={{ search: "", hash: "" }}
          projects={[gettingStarted]}
          currentProject={gettingStarted}
          currentFilePath="/projects/gs/index.krs"
          navigateToProject={vi.fn<(project: Project) => void>()}
          selectFile={vi.fn<(path: string) => Promise<boolean>>(async () => true)}
          openBundledExample={openBundledExample}
          dispatch={vi.fn<(action: AppAction) => void>()}
        />
      </CommandProvider>
    </LocaleProvider>,
  );
}

function runCommand(name: RegExp) {
  fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("Restart Guided Tour… (#3597)", () => {
  it("opens one copy of the sample even when run again while the first is opening (TPL-1534)", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Restart Guided Tour/);
    runCommand(/Restart Guided Tour/);
    expect(open.openBundledExample).toHaveBeenCalledTimes(1);

    await act(async () => open.resolve(copy));
    expect(localStorage.getItem("karasu-first-run-tour-project")).toBe("tour");
  });

  it("is ignored while a Welcome choice is still opening the sample", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Design a service split/ }));
    runCommand(/Restart Guided Tour/);
    expect(open.openBundledExample).toHaveBeenCalledTimes(1);

    await act(async () => open.resolve(copy));
    expect(localStorage.getItem("karasu-first-run-tour-project")).toBe("tour");
  });

  it("does not start the tour when the visitor chose the editor while the sample was opening", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Restart Guided Tour/);
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Open the editor/ }));

    await act(async () => open.resolve(copy));
    expect(screen.queryByRole("region", { name: "Guided tour" })).toBeNull();
    expect(localStorage.getItem("karasu-first-run-tour-project")).toBeNull();
  });

  it("closes Welcome when it runs while Welcome is open", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Show Welcome/);
    expect(screen.getByRole("dialog")).not.toBeNull();

    // The palette chord still reaches the registry while the dialog is open.
    runCommand(/Restart Guided Tour/);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => open.resolve(copy));
  });
});
