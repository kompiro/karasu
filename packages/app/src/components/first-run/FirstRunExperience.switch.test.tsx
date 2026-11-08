// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExampleProject, Project } from "@karasu-tools/core";
import { LocaleProvider } from "../../i18n/index.js";
import { CommandProvider } from "../../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../../keyboard/KeyboardShortcutDispatcher.js";
import type { FileSelectionStatus } from "../../hooks/useFileSelection.js";
import type { AppAction } from "../../state/app-reducer.js";
import { requestReveal } from "../../state/preview-reveal.js";
import { CommandPalette } from "../CommandPalette.js";
import { FirstRunExperience } from "./FirstRunExperience.js";
import { readTourProgress, writeTourProgress } from "./tour-progress.js";
import type { TourResume } from "./tour-resume.js";
import { readTourProject, writeTourProject } from "./tour-project.js";
import type { TourId } from "./tour-steps.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  requestReveal(null);
});

const stamp = { createdAt: "2026-11-07T00:00:00Z", updatedAt: "2026-11-07T00:00:00Z" };
const project = (id: string, name: string): Project => ({
  id,
  name,
  rootPath: `/projects/${id}`,
  ...stamp,
});
const shop = project("shop", "service-split");
const payroll = project("payroll", "payroll-split");
const other = project("other", "my-model");

const TO_PAYROLL = /Try it with a payroll system instead/;
const TO_SHOP = /Try it with an online shop instead/;

interface Options {
  tour?: TourId;
  step?: number;
  projects?: Project[];
  add?: (example: ExampleProject) => Promise<Project | null>;
  matches?: (project: Project, example: ExampleProject) => Promise<boolean>;
}

/** A guide resumed in `shop` or `payroll`, with the open project the test moves by hand. */
function renderGuide({
  tour = "service-split",
  step = 0,
  projects = [shop, other],
  add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(),
  matches = async () => true,
}: Options = {}) {
  const home = tour === "service-split-payroll" ? payroll : shop;
  const tourResume: TourResume = {
    kind: "resume",
    tour,
    projectId: home.id,
    root: home.rootPath,
    step,
  };
  writeTourProgress({ tour, projectId: home.id, step });
  writeTourProject({ tour, projectId: home.id });
  const navigateToProject = vi.fn<(project: Project) => void>();
  const ui = (open: Project) => (
    <LocaleProvider initialLocale="en">
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <CommandPalette />
        <FirstRunExperience
          seededDefaults={false}
          initialLocation={{ search: "", hash: "" }}
          tourResume={tourResume}
          projects={projects}
          currentProject={open}
          currentFilePath={`${open.rootPath}/index.krs`}
          activeView="system"
          viewPath={[]}
          navigateToProject={navigateToProject}
          selectFile={vi.fn<(path: string) => Promise<FileSelectionStatus>>(async () => "opened")}
          keepOpenFile={vi.fn<() => void>()}
          addBundledExample={add}
          matchesExample={matches}
          dispatch={vi.fn<(action: AppAction) => void>()}
        />
      </CommandProvider>
    </LocaleProvider>
  );
  const view = render(ui(home));
  return {
    navigateToProject,
    openProject: async (open: Project) => act(async () => view.rerender(ui(open))),
  };
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const panelText = () => screen.queryByRole("region", { name: "Guided tour" })?.textContent;

describe("offering the other subject (#3601)", () => {
  it("is on step 1 of the Design guide, and not on later steps", () => {
    renderGuide();
    expect(screen.queryByRole("button", { name: TO_PAYROLL })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.queryByRole("button", { name: TO_PAYROLL })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.queryByRole("button", { name: TO_PAYROLL })).not.toBeNull();
  });

  it.each(["understand", "evolve"] as const)("is not on the %s guide", (tour) => {
    renderGuide({ tour });
    expect(screen.queryByRole("button", { name: TO_PAYROLL })).toBeNull();
    expect(screen.queryByRole("button", { name: TO_SHOP })).toBeNull();
  });

  it("offers the way back on the payroll guide", () => {
    renderGuide({ tour: "service-split-payroll", projects: [payroll, other] });
    expect(screen.queryByRole("button", { name: TO_SHOP })).not.toBeNull();
    expect(screen.queryByRole("button", { name: TO_PAYROLL })).toBeNull();
  });
});

describe("switching the subject (#3601)", () => {
  it("adds a copy of the other sample when there is none, and starts its guide at step 1", async () => {
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => payroll);
    const { navigateToProject } = renderGuide({ add });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_PAYROLL }));
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0].name).toBe("payroll-split");
    expect(navigateToProject).toHaveBeenCalledTimes(1);
    expect(navigateToProject).toHaveBeenCalledWith(payroll);
    expect(readTourProgress()).toEqual({
      tour: "service-split-payroll",
      projectId: "payroll",
      step: 0,
    });
    expect(readTourProject()).toEqual({ tour: "service-split-payroll", projectId: "payroll" });
  });

  it("goes back to the unedited copy instead of piling up copies", async () => {
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>();
    const { navigateToProject } = renderGuide({
      tour: "service-split-payroll",
      projects: [shop, payroll, other],
      add,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_SHOP }));
    });
    expect(add).not.toHaveBeenCalled();
    expect(navigateToProject).toHaveBeenCalledWith(shop);
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "shop", step: 0 });
  });

  it("adds a new copy when the existing one was edited, and leaves that one alone", async () => {
    const fresh = project("fresh", "service-split (2)");
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => fresh);
    const { navigateToProject } = renderGuide({
      tour: "service-split-payroll",
      projects: [shop, payroll],
      add,
      matches: async () => false,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_SHOP }));
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(navigateToProject).toHaveBeenCalledWith(fresh);
    expect(readTourProgress()?.projectId).toBe("fresh");
  });

  it("ignores a second press while the first is resolving", async () => {
    const pending = deferred<Project | null>();
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(() => pending.promise);
    renderGuide({ add });
    const button = screen.getByRole("button", { name: TO_PAYROLL });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(payroll));
  });

  it("does not undo the switch on the second click of a double-click", async () => {
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => payroll);
    const { openProject } = renderGuide({ add });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_PAYROLL }), { detail: 1 });
    });
    expect(readTourProgress()?.tour).toBe("service-split-payroll");
    await openProject(payroll);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_SHOP }), { detail: 2 });
    });
    expect(readTourProgress()?.tour).toBe("service-split-payroll");
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("locks the panel while it resolves, so Skip neither works nor brings the guide back", async () => {
    const pending = deferred<Project | null>();
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(() => pending.promise);
    renderGuide({ add });
    fireEvent.click(screen.getByRole("button", { name: TO_PAYROLL }));

    const skip = screen.getByRole("button", { name: "✕ Skip tour" });
    const next = screen.getByRole("button", { name: "Next →" });
    expect(skip.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(skip);
    fireEvent.click(next);
    expect(panelText()).toContain("1 / 5");

    await act(async () => pending.resolve(payroll));
    expect(readTourProgress()).toEqual({
      tour: "service-split-payroll",
      projectId: "payroll",
      step: 0,
    });
  });

  it("unlocks the panel when the sample could not be added, and stays on the guide", async () => {
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => null);
    const { navigateToProject } = renderGuide({ add });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TO_PAYROLL }));
    });
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "shop", step: 0 });
    expect(screen.getByRole("button", { name: "Next →" }).getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  // The panel lock does not reach the project selector: the visitor's newer
  // choice wins on both paths, before anything moves them (TPL-1534).
  it("stays in the project the visitor opened while a new copy was being added", async () => {
    const pending = deferred<Project | null>();
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>(() => pending.promise);
    const { navigateToProject, openProject } = renderGuide({ add });
    fireEvent.click(screen.getByRole("button", { name: TO_PAYROLL }));
    await openProject(other);
    await act(async () => pending.resolve(payroll));
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "shop", step: 0 });
  });

  it("stays in the project the visitor opened while an existing copy was being read", async () => {
    const reading = deferred<boolean>();
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>();
    const { navigateToProject, openProject } = renderGuide({
      tour: "service-split-payroll",
      projects: [shop, payroll, other],
      add,
      matches: () => reading.promise,
    });
    fireEvent.click(screen.getByRole("button", { name: TO_SHOP }));
    await openProject(other);
    await act(async () => reading.resolve(true));
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(readTourProgress()?.tour).toBe("service-split-payroll");
  });

  it("adds no copy when the visitor opened another project during the read of an edited one", async () => {
    const reading = deferred<boolean>();
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>();
    const { openProject } = renderGuide({
      tour: "service-split-payroll",
      projects: [shop, payroll, other],
      add,
      matches: () => reading.promise,
    });
    fireEvent.click(screen.getByRole("button", { name: TO_SHOP }));
    await openProject(other);
    await act(async () => reading.resolve(false));
    expect(add).not.toHaveBeenCalled();
  });
});

describe("Restart after switching (#3601)", () => {
  const runRestart = () => {
    fireEvent.keyDown(document, { key: "p", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Restart Guided Tour/ }));
  };

  it("walks the payroll guide again in its project", async () => {
    renderGuide({ tour: "service-split-payroll", step: 2, projects: [shop, payroll] });
    runRestart();
    await act(async () => {});
    expect(readTourProgress()).toEqual({
      tour: "service-split-payroll",
      projectId: "payroll",
      step: 0,
    });
  });

  it("follows the switch's rule when its project is gone: an unedited copy is used", async () => {
    const add = vi.fn<(example: ExampleProject) => Promise<Project | null>>();
    const copy = project("copy", "payroll-split (2)");
    renderGuide({ tour: "service-split-payroll", projects: [copy, payroll], add });
    writeTourProject({ tour: "service-split-payroll", projectId: "gone" });
    runRestart();
    await act(async () => {});
    expect(add).not.toHaveBeenCalled();
    // The open project comes first, so no move is needed.
    expect(readTourProgress()?.projectId).toBe("payroll");
  });
});
