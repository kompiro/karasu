import { Fragment, useState } from "react";
import { getReference } from "@karasu-tools/core";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClipboardCopy } from "../hooks/useClipboardCopy.js";
import type { ActiveView } from "../state/app-reducer.js";
import { useTranslation } from "../i18n/index.js";

type Tab = "syntax" | "styles" | "tags" | "builtin" | "samples";

const TAB_LABELS: Record<Tab, string> = {
  syntax: "Syntax",
  styles: "Styles",
  tags: "Tags & Annotations",
  builtin: "Built-in Theme",
  samples: "Samples",
};

/** The diagram families the reference content is keyed on (matrix → system). */
type RefView = "system" | "deploy" | "org";
const refViewOf = (v: ActiveView): RefView =>
  v === "deploy" ? "deploy" : v === "org" ? "org" : "system";

/**
 * The reference body — tab bar + per-view content. Rendered standalone in the
 * pop-out reference window (see {@link ReferenceWindow}) so the user can consult
 * it while editing in the main window (#1548 follow-up: the modal Dialog trapped
 * focus and blocked the editor).
 */
export function ReferenceContent({ activeView = "system" }: { activeView?: ActiveView }) {
  const [activeTab, setActiveTab] = useState<Tab>("syntax");
  const { locale } = useTranslation();
  const ref = getReference(locale);

  return (
    <div className="reference-content-root">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList className="reference-panel-tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {TAB_LABELS[tab]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="reference-panel-content">
        {activeTab === "syntax" && <SyntaxTab activeView={activeView} />}
        {activeTab === "styles" && <StylesTab activeView={activeView} />}
        {activeTab === "tags" && <TagsTab activeView={activeView} />}
        {activeTab === "builtin" && (
          <CopyableSourceTab
            descriptionKey="referencePanel.builtin.description"
            source={ref.builtinStyleSource}
          />
        )}
        {activeTab === "samples" && (
          <CopyableSourceTab
            descriptionKey="referencePanel.samples.description"
            source={ref.samplesByView[refViewOf(activeView)]}
          />
        )}
      </div>
    </div>
  );
}

interface KindRow {
  kind: string;
  description: string;
  canContain?: string[];
  properties: string[];
}

/** Kind table shared by the system / deploy / org syntax tabs. Deploy units
 *  have no containment, so the "Contains" column is omitted for them. */
function KindTable({ kinds, showContains }: { kinds: KindRow[]; showContains: boolean }) {
  return (
    <table className="reference-table">
      <thead>
        <tr>
          <th>Kind</th>
          <th>Description</th>
          {showContains && <th>Contains</th>}
          <th>Properties</th>
        </tr>
      </thead>
      <tbody>
        {kinds.map((k) => (
          <tr key={k.kind}>
            <td>
              <code>{k.kind}</code>
            </td>
            <td>{k.description}</td>
            {showContains && (
              <td>
                {k.canContain && k.canContain.length > 0
                  ? k.canContain.map((c) => <code key={c}>{c}</code>)
                  : "—"}
              </td>
            )}
            <td>
              {k.properties.map((p) => (
                <code key={p}>{p}</code>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SyntaxTab({ activeView }: { activeView: ActiveView }) {
  const { locale } = useTranslation();
  const ref = getReference(locale);
  const view = refViewOf(activeView);
  const kinds: KindRow[] =
    view === "deploy" ? ref.deployUnitKinds : view === "org" ? ref.orgKinds : ref.nodeKinds;

  return (
    <div className="reference-tab-body">
      {ref.syntaxSnippets[view].map((section) => (
        <Fragment key={section.heading}>
          <h3>{section.heading}</h3>
          {section.code !== undefined ? (
            <div className="reference-code-block">
              <pre>{section.code}</pre>
            </div>
          ) : (
            <KindTable kinds={kinds} showContains={view !== "deploy"} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function StylesTab({ activeView }: { activeView: ActiveView }) {
  const { locale } = useTranslation();
  const ref = getReference(locale);

  return (
    <div className="reference-tab-body">
      <h3>Selector Examples</h3>
      <div className="reference-code-block">
        <pre>{ref.styleSelectorExamples[refViewOf(activeView)]}</pre>
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
          {ref.selectorSpecificity.map((s) => (
            <tr key={s.example}>
              <td>{s.selector}</td>
              <td>
                <code>{s.example}</code>
              </td>
              <td>{s.score}</td>
            </tr>
          ))}
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

/**
 * A tab that shows a copyable source block — the single component the
 * previously character-for-character-identical `BuiltinTab` / `SamplesTab`
 * collapse into (#1548). The only per-tab difference is the description key.
 */
function CopyableSourceTab({
  descriptionKey,
  source,
}: {
  descriptionKey: "referencePanel.builtin.description" | "referencePanel.samples.description";
  source: string;
}) {
  const { t } = useTranslation();
  const { copy, copied } = useClipboardCopy();
  return (
    <div className="reference-tab-body">
      <div className="reference-builtin-header">
        <span>{t(descriptionKey)}</span>
        <Button className="reference-copy-btn" onClick={() => copy(source)}>
          {copied ? t("referencePanel.copy.copied") : t("referencePanel.copy.label")}
        </Button>
      </div>
      <div className="reference-code-block">
        <pre>{source}</pre>
      </div>
    </div>
  );
}
