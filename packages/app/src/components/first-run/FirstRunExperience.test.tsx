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
import { beginEvent, recordEvent, resetAppSignals } from "../../state/app-signals.js";
import { CommandPalette } from "../CommandPalette.js";
import { FirstRunExperience } from "./FirstRunExperience.js";
import { TOUR_PROGRESS_KEY, readTourProgress, writeTourProgress } from "./tour-progress.js";
import { KEEP_TOUR, type TourResume } from "./tour-resume.js";
import { readTourProject, writeTourProject } from "./tour-project.js";
import { TOURS, type TourId } from "./tour-steps.js";

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

function setup(
  openBundledExample: (example: ExampleProject) => Promise<Project | null>,
  {
    tourResume = KEEP_TOUR,
    open = gettingStarted,
    matchesExample = async () => true,
    navigateToProject = vi.fn<(project: Project) => void>(),
    projects = [gettingStarted, copy],
  }: {
    tourResume?: TourResume;
    open?: Project;
    matchesExample?: (project: Project, example: ExampleProject) => Promise<boolean>;
    navigateToProject?: (project: Project) => void;
    projects?: Project[];
  } = {},
) {
  return render(
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
          openBundledExample={openBundledExample}
          matchesExample={matchesExample}
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
    expect(readTourProject()).toEqual({ tour: "service-split", projectId: "tour" });
  });

  it("is ignored while a Welcome choice is still opening the sample", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Design a service split/ }));
    runCommand(/Restart Guided Tour/);
    expect(open.openBundledExample).toHaveBeenCalledTimes(1);

    await act(async () => open.resolve(copy));
    expect(readTourProject()).toEqual({ tour: "service-split", projectId: "tour" });
  });

  it("does not start the tour when the visitor chose the editor while the sample was opening", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Restart Guided Tour/);
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Open the editor/ }));

    await act(async () => open.resolve(copy));
    expect(screen.queryByRole("region", { name: "Guided tour" })).toBeNull();
    expect(readTourProject()).toBeNull();
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

describe("where a guide starts (#3600)", () => {
  const edited: Project = { ...gettingStarted, id: "gs-edited", rootPath: "/projects/gs-edited" };
  const chooseUnderstand = () => {
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Understand an existing system/ }));
  };
  const openNever = () => vi.fn<(example: ExampleProject) => Promise<Project | null>>();

  it("Understand uses the open Getting Started while it matches the sample, without navigating", async () => {
    const open = openNever();
    const navigateToProject = vi.fn<(project: Project) => void>();
    setup(open, { navigateToProject });
    chooseUnderstand();
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "understand", projectId: "gs", step: 0 });
    expect(readTourProject()).toEqual({ tour: "understand", projectId: "gs" });
  });

  it("Understand navigates to a matching Getting Started that is not open", async () => {
    const open = openNever();
    const navigateToProject = vi.fn<(project: Project) => void>();
    setup(open, { navigateToProject, open: copy });
    chooseUnderstand();
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(navigateToProject).toHaveBeenCalledWith(gettingStarted);
  });

  it("Understand skips an edited Getting Started for a matching one", async () => {
    const open = openNever();
    setup(open, {
      projects: [edited, gettingStarted],
      matchesExample: async (project) => project.id === "gs",
    });
    chooseUnderstand();
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(readTourProgress()?.projectId).toBe("gs");
  });

  it("Understand reuses an unedited copy it opened earlier, not a project of another name", async () => {
    const earlier: Project = { ...gettingStarted, id: "gs-2", name: "getting-started (2)" };
    const other: Project = { ...gettingStarted, id: "mine", name: "getting-started (work)" };
    const open = openNever();
    const matchesExample = vi.fn<(project: Project, example: ExampleProject) => Promise<boolean>>(
      async (project) => project.id !== "gs",
    );
    setup(open, { projects: [gettingStarted, other, earlier], matchesExample });
    chooseUnderstand();
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(matchesExample.mock.calls.map(([project]) => project.id)).toEqual(["gs", "gs-2"]);
    expect(readTourProgress()?.projectId).toBe("gs-2");
  });

  it("Understand opens a new copy when no Getting Started matches, and does not navigate again", async () => {
    const fresh: Project = { ...gettingStarted, id: "gs-2", rootPath: "/projects/gs-2" };
    const open = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => fresh);
    const navigateToProject = vi.fn<(project: Project) => void>();
    setup(open, { navigateToProject, matchesExample: async () => false });
    chooseUnderstand();
    await act(async () => {});
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0].name).toBe("getting-started");
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "understand", projectId: "gs-2", step: 0 });
  });

  it("drops an Understand the visitor chose the editor over while reading (TPL-1534)", async () => {
    let finish: (matches: boolean) => void = () => {};
    const open = openNever();
    setup(open, {
      matchesExample: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    chooseUnderstand();
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Open the editor/ }));
    await act(async () => finish(true));
    expect(screen.queryByRole("region", { name: "Guided tour" })).toBeNull();
    expect(readTourProgress()).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("Evolve opens a new copy of service-split every time", async () => {
    const open = vi.fn<(example: ExampleProject) => Promise<Project | null>>(async () => copy);
    setup(open, { open: copy });
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Track architecture evolution/ }));
    await act(async () => {});
    expect(open.mock.calls[0][0].name).toBe("service-split");
    expect(readTourProgress()).toEqual({ tour: "evolve", projectId: "tour", step: 0 });
    expect(screen.getByRole("region", { name: "Guided tour" }).textContent).toContain("1 / 4");
  });

  it("Restart redoes the last guide started, in its project", async () => {
    writeTourProject({ tour: "understand", projectId: "tour" });
    const open = openNever();
    setup(open);
    runCommand(/Restart Guided Tour/);
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "understand", projectId: "tour", step: 0 });
  });

  it("Restart reads a project id recorded before #3600 as the Design guide", async () => {
    localStorage.setItem("karasu-first-run-tour-project", "tour");
    setup(openNever());
    runCommand(/Restart Guided Tour/);
    await act(async () => {});
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "tour", step: 0 });
  });

  it("Restart opens the guide the way its entry does when its project is gone", async () => {
    writeTourProject({ tour: "understand", projectId: "gone" });
    const open = openNever();
    setup(open);
    runCommand(/Restart Guided Tour/);
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
    expect(readTourProgress()).toEqual({ tour: "understand", projectId: "gs", step: 0 });
  });
});

describe("tour progress (#3598)", () => {
  const panel = () => screen.queryByRole("region", { name: "Guided tour" });
  const resumeAt = (step: number, tour: TourId = "service-split"): TourResume => ({
    kind: "resume",
    tour,
    projectId: copy.id,
    root: copy.rootPath,
    step,
  });

  it("records the step where the tour starts and moves, and removes it on Skip", async () => {
    const open = deferredOpen();
    setup(open.openBundledExample, { open: copy });
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Design a service split/ }));
    await act(async () => open.resolve(copy));
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "tour", step: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "tour", step: 2 });
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "tour", step: 1 });

    fireEvent.click(screen.getByRole("button", { name: "✕ Skip tour" }));
    expect(localStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
  });

  it("shows a resumed tour at its step from the first render, and Continue to editor removes it", () => {
    writeTourProgress({ tour: "service-split", projectId: "tour", step: 4 });
    setup(vi.fn(), { tourResume: resumeAt(4), open: copy });
    expect(panel()?.textContent).toContain("5 / 5");

    fireEvent.click(screen.getByRole("button", { name: "✓ Continue to editor" }));
    expect(panel()).toBeNull();
    expect(localStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
  });

  it("replaces the record when another guide starts (#3600)", async () => {
    writeTourProgress({ tour: "service-split", projectId: "tour", step: 2 });
    const open = deferredOpen();
    setup(open.openBundledExample);
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Track architecture evolution/ }));
    await act(async () => open.resolve(copy));
    expect(readTourProgress()).toEqual({ tour: "evolve", projectId: "tour", step: 0 });
  });

  it("shows a resumed guide under its own heading, and moves within its steps (#3600)", () => {
    writeTourProgress({ tour: "understand", projectId: "tour", step: 2 });
    setup(vi.fn(), { tourResume: resumeAt(2, "understand"), open: copy });
    expect(panel()?.textContent).toContain("Understand an existing system");
    expect(panel()?.textContent).toContain("3 / 4");

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(readTourProgress()).toEqual({ tour: "understand", projectId: "tour", step: 3 });
    expect(screen.getByRole("button", { name: "✓ Continue to editor" })).not.toBeNull();
  });

  it("leaves the record alone when the visitor opens the editor", () => {
    writeTourProgress({ tour: "evolve", projectId: "tour", step: 1 });
    setup(vi.fn());
    runCommand(/Show Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /Open the editor/ }));
    expect(readTourProgress()).toEqual({ tour: "evolve", projectId: "tour", step: 1 });
  });

  it("deletes a record the boot discarded, and leaves one it kept for a later boot", () => {
    localStorage.setItem(TOUR_PROGRESS_KEY, "{not json");
    setup(vi.fn(), { tourResume: { kind: "discard" } });
    expect(localStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
    cleanup();

    writeTourProgress({ tour: "service-split", projectId: "tour", step: 2 });
    setup(vi.fn());
    expect(panel()).toBeNull();
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "tour", step: 2 });
  });
});

describe("a step's ask marked done (#3599)", () => {
  afterEach(() => resetAppSignals());

  const resumeAt = (step: number, tour: TourId = "service-split"): TourResume => ({
    kind: "resume",
    tour,
    projectId: copy.id,
    root: copy.rootPath,
    step,
  });

  /** A resumed tour in `copy`, with the app state the test moves by hand. */
  function renderTour(step: number) {
    writeTourProgress({ tour: "service-split", projectId: "tour", step });
    const file = `${copy.rootPath}/${TOURS["service-split"].steps[step].scene.file}`;
    const ui = (over: { open?: Project; viewPath?: string[] } = {}) => {
      const open = over.open ?? copy;
      return (
        <LocaleProvider initialLocale="en">
          <CommandProvider>
            <FirstRunExperience
              seededDefaults={false}
              initialLocation={{ search: "", hash: "" }}
              tourResume={resumeAt(step)}
              projects={[gettingStarted, copy]}
              currentProject={open}
              currentFilePath={open === copy ? file : `${open.rootPath}/index.krs`}
              activeView="system"
              viewPath={over.viewPath ?? []}
              navigateToProject={vi.fn<(project: Project) => void>()}
              selectFile={vi.fn<(path: string) => Promise<FileSelectionStatus>>(
                async () => "opened",
              )}
              keepOpenFile={vi.fn<() => void>()}
              openBundledExample={vi.fn<(example: ExampleProject) => Promise<Project | null>>()}
              matchesExample={vi.fn<(p: Project, e: ExampleProject) => Promise<boolean>>()}
              dispatch={vi.fn<(action: AppAction) => void>()}
            />
          </CommandProvider>
        </LocaleProvider>
      );
    };
    const view = render(ui());
    return {
      update: async (over: Parameters<typeof ui>[0]) => act(async () => view.rerender(ui(over))),
    };
  }

  const doneText = () => screen.queryByText(/✓ Done/);

  it("marks the drill step once the visitor drilled in, and keeps it after they drill out", async () => {
    const tour = renderTour(0);
    await act(async () => {});
    expect(doneText()).toBeNull();

    await tour.update({ viewPath: ["CommerceApp"] });
    const done = doneText();
    expect(done).not.toBeNull();
    const next = screen.getByRole("button", { name: "Next →" });
    expect(next.getAttribute("aria-describedby")).toBe(done?.id);

    await tour.update({ viewPath: [] });
    expect(doneText()).not.toBeNull();
  });

  it("does not count a share made in another project", async () => {
    const tour = renderTour(4);
    await act(async () => {});
    await tour.update({ open: gettingStarted });
    act(() => recordEvent("share-opened"));
    await tour.update({ open: copy });
    expect(doneText()).toBeNull();

    act(() => recordEvent("share-opened"));
    expect(doneText()).not.toBeNull();
  });

  it("does not count a share begun in another project that finishes after coming back", async () => {
    const tour = renderTour(4);
    await act(async () => {});
    await tour.update({ open: gettingStarted });
    let started = 0;
    act(() => {
      started = beginEvent();
    });
    await tour.update({ open: copy });
    act(() => recordEvent("share-opened", started));
    expect(doneText()).toBeNull();
  });
});
