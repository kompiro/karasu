// @vitest-environment jsdom
import type { SystemNode, OrganizationBlock } from "@karasu-tools/core";
import { compile } from "@karasu-tools/core";
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildTools,
  reviewTriggerMessage,
  interviewTriggerMessage,
  type BuildSystemPromptArgs,
} from "./prompt";

const baseArgs: Omit<BuildSystemPromptArgs, "locale"> = {
  scopeLabel: "ECPlatform",
  viewPath: ["ECPlatform"],
  fileContent: "system ECPlatform { }\n",
  currentFilePath: "ec.krs",
  resolvedSystems: [] as SystemNode[],
  organizations: [] as OrganizationBlock[],
  ownerIndex: new Map<string, string>(),
};

describe("buildSystemPrompt", () => {
  it("produces a Japanese prompt when locale is 'ja'", () => {
    const prompt = buildSystemPrompt({ ...baseArgs, locale: "ja" });

    expect(prompt).toContain("あなたは karasu");
    expect(prompt).toContain("## 現在のスコープ");
    expect(prompt).toContain("## ファイルの内容");
    expect(prompt).toContain("## 構造化インタビュー");
    expect(prompt).toContain("## ルール");
  });

  it("produces an English prompt when locale is 'en'", () => {
    const prompt = buildSystemPrompt({ ...baseArgs, locale: "en" });

    expect(prompt).toContain("You are the assistant of the karasu");
    expect(prompt).toContain("## Current scope");
    expect(prompt).toContain("## File contents");
    expect(prompt).toContain("## Structured interview");
    expect(prompt).toContain("## Rules");
  });

  it("interpolates the same scope label in both locales", () => {
    const scopeLabel = "ECPlatform / ECommerce";
    const ja = buildSystemPrompt({ ...baseArgs, scopeLabel, locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, scopeLabel, locale: "en" });

    expect(ja).toContain(scopeLabel);
    expect(en).toContain(scopeLabel);
  });

  it("interpolates the same file contents in both locales", () => {
    const fileContent = "system AnotherSystem {\n  service ServiceA {}\n}\n";
    const ja = buildSystemPrompt({ ...baseArgs, fileContent, locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, fileContent, locale: "en" });

    expect(ja).toContain(fileContent);
    expect(en).toContain(fileContent);
  });

  it("preserves the current file path section label in each language", () => {
    const ja = buildSystemPrompt({ ...baseArgs, locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, locale: "en" });

    expect(ja).toContain("## 編集対象ファイル");
    expect(en).toContain("## File being edited");
  });

  it("omits the file-being-edited section when currentFilePath is null", () => {
    const ja = buildSystemPrompt({ ...baseArgs, currentFilePath: null, locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, currentFilePath: null, locale: "en" });

    expect(ja).not.toContain("## 編集対象ファイル");
    expect(en).not.toContain("## File being edited");
    expect(ja).toContain("## ファイルの内容");
    expect(en).toContain("## File contents");
  });

  it("does not include the full model graph section when there are no systems", () => {
    const ja = buildSystemPrompt({ ...baseArgs, resolvedSystems: [], locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, resolvedSystems: [], locale: "en" });

    expect(ja).not.toContain("## アーキテクチャモデル全体");
    expect(en).not.toContain("## Full architecture model");
  });

  it("uses the matching interview guide for each locale at system scope", () => {
    const ja = buildSystemPrompt({ ...baseArgs, locale: "ja" });
    const en = buildSystemPrompt({ ...baseArgs, locale: "en" });

    expect(ja).toContain("このスコープ（システムレベル）");
    expect(en).toContain("At this scope (system level)");
  });
});

// Issue #1580: the organization graph (teams / owns / members / links) must be
// serialized into the model JSON so org/ownership queries resolve even when the
// `organization` block is declared in an imported file — not the current file.
// See TPL-20260514-02 (imported declarations must reach the merged graph) and
// TPL-20260615-01 (the 1:1 ownerIndex picks the @migration_target winner).
describe("buildSystemPrompt — organization graph (multi-file ownership)", () => {
  // The org block here stands in for one declared in an *imported* file: the
  // merged compile carries it in `organizations` / `ownerIndex`, while the
  // current file's content (below) does not mention any of it.
  const mergedSource = `
system ECPlatform {
  service ECommerce { label "EC Site" }
  service Payment { label "Payment" }
}

organization TechCorp {
  label "TechCorp Engineering"
  team "ec-team" {
    label "EC Team"
    owns ECommerce
    link "https://slack.example.com/ec" "EC Team Slack"
    member alice {
      label "Alice"
      slack "@alice"
      github "alice-h"
    }
    team "ec-sub" {
      label "EC Sub Team"
      owns Payment
    }
  }
}
`;

  // The file the user is editing only imports the org file — it does not
  // declare the organization itself.
  const importingFileContent =
    'import "org.krs"\n\nsystem ECPlatform {\n  service ECommerce {}\n}\n';

  function mergedOrgArgs(): Pick<
    BuildSystemPromptArgs,
    "resolvedSystems" | "organizations" | "ownerIndex"
  > {
    const org = compile(mergedSource, { diagramType: "org" });
    if (org.diagramType !== "org") throw new Error("expected an org compile result");
    const sys = compile(mergedSource, { diagramType: "system" });
    if (sys.diagramType !== "system") throw new Error("expected a system compile result");
    return {
      resolvedSystems: sys.systems,
      organizations: org.organizations,
      ownerIndex: org.ownerIndex,
    };
  }

  it("serializes teams / owns / members / links / subteams even when the org block is not in the current file", () => {
    const args = mergedOrgArgs();
    // Guard: the org data really is absent from the file content the AI sees.
    expect(importingFileContent).not.toContain("ec-team");
    expect(importingFileContent).not.toContain("TechCorp");

    for (const locale of ["ja", "en"] as const) {
      const prompt = buildSystemPrompt({
        ...baseArgs,
        fileContent: importingFileContent,
        ...args,
        locale,
      });
      expect(prompt).toContain("TechCorp");
      expect(prompt).toContain("ec-team");
      expect(prompt).toContain("ECommerce"); // owns target
      expect(prompt).toContain("ec-sub"); // nested subteam
      expect(prompt).toContain("alice"); // member
      expect(prompt).toContain("@alice"); // member slack
      expect(prompt).toContain("alice-h"); // member github
      expect(prompt).toContain("https://slack.example.com/ec"); // team link
    }
  });

  it("annotates each owned service/domain with its resolved owner team", () => {
    const args = mergedOrgArgs();
    expect(args.ownerIndex.get("ECommerce")).toBe("ec-team");
    expect(args.ownerIndex.get("Payment")).toBe("ec-sub");

    const prompt = buildSystemPrompt({
      ...baseArgs,
      fileContent: importingFileContent,
      ...args,
      locale: "en",
    });
    // Per-node owner annotation in the serialized model graph.
    expect(prompt).toMatch(/"id":\s*"ECommerce"[\s\S]*?"owner":\s*"ec-team"/);
  });

  it("renders the model section when organizations exist even with no systems", () => {
    const { organizations, ownerIndex } = mergedOrgArgs();
    const ja = buildSystemPrompt({
      ...baseArgs,
      resolvedSystems: [],
      organizations,
      ownerIndex,
      locale: "ja",
    });
    const en = buildSystemPrompt({
      ...baseArgs,
      resolvedSystems: [],
      organizations,
      ownerIndex,
      locale: "en",
    });
    expect(ja).toContain("## アーキテクチャモデル全体");
    expect(en).toContain("## Full architecture model");
  });

  it("instructs the model to read org data from the serialized graph, not the file content", () => {
    const args = mergedOrgArgs();
    const en = buildSystemPrompt({
      ...baseArgs,
      fileContent: importingFileContent,
      ...args,
      locale: "en",
    });
    const ja = buildSystemPrompt({
      ...baseArgs,
      fileContent: importingFileContent,
      ...args,
      locale: "ja",
    });
    expect(en).toContain("imported file");
    expect(en).toContain("`organizations` section");
    expect(ja).toContain("import 元の別ファイル");
  });
});

describe("buildTools", () => {
  it("returns the same tool names and schema shape in both locales", () => {
    const ja = buildTools("ja");
    const en = buildTools("en");
    expect(ja.map((t) => t.name)).toEqual(["navigate_view", "apply_krs_patch"]);
    expect(en.map((t) => t.name)).toEqual(["navigate_view", "apply_krs_patch"]);
    // Descriptions are localized (translated). Verify the property names and
    // `required` arrays match so tool-call parsing stays locale-independent.
    for (let i = 0; i < ja.length; i++) {
      expect(Object.keys(ja[i].input_schema.properties ?? {}).sort()).toEqual(
        Object.keys(en[i].input_schema.properties ?? {}).sort(),
      );
      expect(ja[i].input_schema.required).toEqual(en[i].input_schema.required);
    }
  });

  it("uses Japanese tool descriptions for 'ja'", () => {
    const [navigateView, applyPatch] = buildTools("ja");
    expect(navigateView.description).toContain("ダイアグラム");
    expect(applyPatch.description).toContain(".krs");
  });

  it("uses English tool descriptions for 'en'", () => {
    const [navigateView, applyPatch] = buildTools("en");
    expect(navigateView.description).toContain("drill-down");
    expect(applyPatch.description).toContain(".krs");
  });
});

describe("trigger messages", () => {
  it("reviewTriggerMessage matches the locale", () => {
    expect(reviewTriggerMessage("ja")).toContain("設計レビュー");
    expect(reviewTriggerMessage("en")).toContain("design review");
  });

  it("interviewTriggerMessage matches the locale", () => {
    expect(interviewTriggerMessage("ja")).toContain("インタビュー");
    expect(interviewTriggerMessage("en")).toContain("interview");
  });
});
