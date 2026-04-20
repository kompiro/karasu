// @vitest-environment jsdom
import type { SystemNode } from "@karasu-tools/core";
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
