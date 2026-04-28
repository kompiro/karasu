import { useState, useCallback } from "react";
import { getReference } from "@karasu-tools/core";
import { useClipboardCopy } from "../hooks/useClipboardCopy.js";
import type { ActiveView } from "../state/app-reducer.js";
import { useTranslation } from "../i18n/index.js";

interface ReferencePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeView?: ActiveView;
}

type Tab = "syntax" | "styles" | "tags" | "builtin" | "samples";

const TAB_LABELS: Record<Tab, string> = {
  syntax: "Syntax",
  styles: "Styles",
  tags: "Tags & Annotations",
  builtin: "Built-in Theme",
  samples: "Samples",
};

export function ReferencePanel({ isOpen, onClose, activeView = "system" }: ReferencePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("syntax");
  const { copy: copyBuiltin, copied } = useClipboardCopy();
  const { copy: copySample, copied: sampleCopied } = useClipboardCopy();
  const { locale } = useTranslation();

  const ref = getReference(locale);

  const handleCopy = useCallback(() => {
    copyBuiltin(ref.builtinStyleSource);
  }, [copyBuiltin, ref.builtinStyleSource]);

  const handleSampleCopy = useCallback(() => {
    copySample(ref.sampleKrs);
  }, [copySample, ref.sampleKrs]);

  if (!isOpen) return null;

  return (
    <div className="reference-panel-overlay" onClick={onClose}>
      <div className="reference-panel" onClick={(e) => e.stopPropagation()}>
        <div className="reference-panel-header">
          <span className="reference-panel-title">Reference</span>
          <button className="reference-panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="reference-panel-tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`reference-panel-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="reference-panel-content">
          {activeTab === "syntax" && <SyntaxTab activeView={activeView} />}
          {activeTab === "styles" && <StylesTab activeView={activeView} />}
          {activeTab === "tags" && <TagsTab activeView={activeView} />}
          {activeTab === "builtin" && (
            <BuiltinTab source={ref.builtinStyleSource} onCopy={handleCopy} copied={copied} />
          )}
          {activeTab === "samples" && (
            <SamplesTab source={ref.sampleKrs} onCopy={handleSampleCopy} copied={sampleCopied} />
          )}
        </div>
      </div>
    </div>
  );
}

function SyntaxTab({ activeView }: { activeView: ActiveView }) {
  const { locale } = useTranslation();
  const ref = getReference(locale);

  if (activeView === "deploy") {
    return (
      <div className="reference-tab-body">
        <h3>Block Declaration</h3>
        <div className="reference-code-block">
          <pre>{`deploy "<name>" {
  // deploy units
}`}</pre>
        </div>

        <h3>Deploy Unit Kinds</h3>
        <table className="reference-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Description</th>
              <th>Properties</th>
            </tr>
          </thead>
          <tbody>
            {ref.deployUnitKinds.map((k) => (
              <tr key={k.kind}>
                <td>
                  <code>{k.kind}</code>
                </td>
                <td>{k.description}</td>
                <td>
                  {k.properties.map((p) => (
                    <code key={p}>{p}</code>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Unit Declaration</h3>
        <div className="reference-code-block">
          <pre>{`<kind> <id> {
  label "<表示名>"
  runtime "<runtime>"   // ⚠ 省略可（警告）
  realizes <serviceId>  // ⚠ 省略可（警告）
}

// oci のみ image を指定可
oci <id> {
  image "<image:tag>"
  runtime "<runtime>"
  realizes <serviceId>
}

// job のみ schedule を指定可
job <id> {
  schedule "0 0 * * *"  // cron 形式。省略で単発実行
  runtime "<runtime>"
  realizes <serviceId>
}

// artifact は任意種別の逃げ弁
artifact <id> {
  type "<custom-type>"
  runtime "<runtime>"
  realizes <serviceId>
}`}</pre>
        </div>
      </div>
    );
  }

  if (activeView === "org") {
    return (
      <div className="reference-tab-body">
        <h3>Block Declaration</h3>
        <div className="reference-code-block">
          <pre>{`organization "<name>" {
  // teams
}`}</pre>
        </div>

        <h3>Org Kinds</h3>
        <table className="reference-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Description</th>
              <th>Contains</th>
              <th>Properties</th>
            </tr>
          </thead>
          <tbody>
            {ref.orgKinds.map((k) => (
              <tr key={k.kind}>
                <td>
                  <code>{k.kind}</code>
                </td>
                <td>{k.description}</td>
                <td>
                  {k.canContain.length > 0
                    ? k.canContain.map((c) => <code key={c}>{c}</code>)
                    : "—"}
                </td>
                <td>
                  {k.properties.map((p) => (
                    <code key={p}>{p}</code>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Node Declaration</h3>
        <div className="reference-code-block">
          <pre>{`organization <id> {
  label "<表示名>"

  team <id> {
    label "<チーム名>"
    owns <serviceId>    // 対応サービス・ドメインを宣言
    owns <domainId>

    member <id> {
      label "<名前>"
      slack  "@handle"  // 省略可
      github "username" // 省略可
    }

    team <id> { ... }   // サブチームのネスト可
  }
}`}</pre>
        </div>
      </div>
    );
  }

  // system (default)
  return (
    <div className="reference-tab-body">
      <h3>Block Declaration</h3>
      <div className="reference-code-block">
        <pre>{`system "<name>" {
  // services, users, edges
}`}</pre>
      </div>

      <h3>Node Kinds</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>Description</th>
            <th>Contains</th>
            <th>Properties</th>
          </tr>
        </thead>
        <tbody>
          {ref.nodeKinds.map((k) => (
            <tr key={k.kind}>
              <td>
                <code>{k.kind}</code>
              </td>
              <td>{k.description}</td>
              <td>
                {k.canContain.length > 0 ? k.canContain.map((c) => <code key={c}>{c}</code>) : "—"}
              </td>
              <td>
                {k.properties.map((p) => (
                  <code key={p}>{p}</code>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Edge Syntax</h3>
      <div className="reference-code-block">
        <pre>
          {`A ->  B "label"   // sync (solid arrow)
A --> B "label"   // async (dashed arrow)`}
        </pre>
      </div>

      <h3>Node Declaration</h3>
      <div className="reference-code-block">
        <pre>{`// minimal (id only)
<kind> <id>

// with tags and annotations
<kind> <id> [<tags>] @<annotations>

// with block (properties and/or children)
<kind> <id> [<tags>] @<annotations> {
  label "<表示名>"        // display name; id used if omitted
  description "<説明>"    // free-form description
  // kind-specific properties (team, role, link, …)
}`}</pre>
      </div>

      <h3>Legend (footer)</h3>
      <div className="reference-code-block">
        <pre>{`// Top-level. Renders as a footer band below each diagram view.
// Scope ("system" | "deploy" | "org") is optional — omit to show on all views.
legend "<title>"? {
  swatch <#hex> "<label>"           // explicit color
  ref @<annotation> "<label>"        // color from .krs.style cascade
  ref [<tag>]       "<label>"        // ditto, by tag
  ref <type>        "<label>"        // ditto, by node-kind type selector
  ref #<id>         "<label>"        // ditto, by node id
}

legend deploy "Hosting tier" {       // scope to a single view
  swatch #0EA5E9 "Cloud Run"
}`}</pre>
      </div>
    </div>
  );
}

function StylesTab({ activeView }: { activeView: ActiveView }) {
  const { locale } = useTranslation();
  const ref = getReference(locale);

  const selectorExamples =
    activeView === "deploy"
      ? `/* deploy diagram selectors */
oci { background-color: #0369A1; }
jar { border-color: #075985; }
war { opacity: 0.8; }
#myUnit { background-color: #1D4ED8; }`
      : activeView === "org"
        ? `/* org diagram selectors */
team { background-color: #0369A1; }
member { border-color: #075985; }
#myTeam { background-color: #1D4ED8; }`
        : `/* system diagram selectors */
service { background-color: #0369A1; }
domain[external] { border-style: dashed; }
user[human] { shape: user; }
edge[async] { border-style: dashed; }
#ECommerce { background-color: #1D4ED8; }`;

  return (
    <div className="reference-tab-body">
      <h3>Selector Examples</h3>
      <div className="reference-code-block">
        <pre>{selectorExamples}</pre>
      </div>

      <h3>Selector Specificity</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Selector</th>
            <th>Example</th>
            <th>Specificity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Type</td>
            <td>
              <code>service</code>
            </td>
            <td>1</td>
          </tr>
          <tr>
            <td>Tag</td>
            <td>
              <code>[external]</code>
            </td>
            <td>10</td>
          </tr>
          <tr>
            <td>Annotation</td>
            <td>
              <code>@deprecated</code>
            </td>
            <td>10</td>
          </tr>
          <tr>
            <td>Type+Tag</td>
            <td>
              <code>service[external]</code>
            </td>
            <td>11</td>
          </tr>
          <tr>
            <td>ID</td>
            <td>
              <code>#ECommerce</code>
            </td>
            <td>100</td>
          </tr>
          <tr>
            <td>Edge</td>
            <td>
              <code>edge</code>
            </td>
            <td>1</td>
          </tr>
          <tr>
            <td>Edge+Tag</td>
            <td>
              <code>edge[async]</code>
            </td>
            <td>11</td>
          </tr>
        </tbody>
      </table>

      <h3>Style Properties</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Applies To</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {ref.styleProperties.map((p) => (
            <tr key={p.name}>
              <td>
                <code>{p.name}</code>
              </td>
              <td>{p.appliesTo}</td>
              <td>{p.keywords ? p.keywords.map((k) => <code key={k}>{k}</code>) : p.valueType}</td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Shapes</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Shape</th>
            <th>Description</th>
            <th>Default For</th>
          </tr>
        </thead>
        <tbody>
          {ref.shapes.map((s) => (
            <tr key={s.name}>
              <td>
                <code>{s.name}</code>
              </td>
              <td>{s.description}</td>
              <td>{s.defaultFor ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagsTab({ activeView }: { activeView: ActiveView }) {
  const { t, locale } = useTranslation();
  const ref = getReference(locale);

  if (activeView !== "system") {
    return (
      <div className="reference-tab-body">
        <p className="reference-unsupported">{t("referencePanel.unsupportedMessage")}</p>
      </div>
    );
  }

  return (
    <div className="reference-tab-body">
      <h3>Tags</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Applies To</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {ref.tags.map((tag) => (
            <tr key={tag.name}>
              <td>
                <code>[{tag.name}]</code>
              </td>
              <td>{tag.appliesTo.join(", ")}</td>
              <td>{tag.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Annotations</h3>
      <table className="reference-table">
        <thead>
          <tr>
            <th>Annotation</th>
            <th>Description</th>
            <th>Badge</th>
          </tr>
        </thead>
        <tbody>
          {ref.annotations.map((a) => (
            <tr key={a.name}>
              <td>
                <code>@{a.name}</code>
              </td>
              <td>{a.description}</td>
              <td>
                <span
                  className="reference-badge-preview"
                  style={{ backgroundColor: a.defaultBadge.color }}
                >
                  {a.defaultBadge.icon} {a.defaultBadge.label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuiltinTab({
  source,
  onCopy,
  copied,
}: {
  source: string;
  onCopy: () => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="reference-tab-body">
      <div className="reference-builtin-header">
        <span>{t("referencePanel.builtin.description")}</span>
        <button className="reference-copy-btn" onClick={onCopy}>
          {copied ? t("referencePanel.copy.copied") : t("referencePanel.copy.label")}
        </button>
      </div>
      <div className="reference-code-block">
        <pre>{source}</pre>
      </div>
    </div>
  );
}

function SamplesTab({
  source,
  onCopy,
  copied,
}: {
  source: string;
  onCopy: () => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="reference-tab-body">
      <div className="reference-builtin-header">
        <span>{t("referencePanel.samples.description")}</span>
        <button className="reference-copy-btn" onClick={onCopy}>
          {copied ? t("referencePanel.copy.copied") : t("referencePanel.copy.label")}
        </button>
      </div>
      <div className="reference-code-block">
        <pre>{source}</pre>
      </div>
    </div>
  );
}
