import { Fragment, useState } from "react";
import { getReference } from "@karasu-tools/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

/** The diagram families the reference content is keyed on (matrix → system). */
type RefView = "system" | "deploy" | "org";
const refViewOf = (v: ActiveView): RefView =>
  v === "deploy" ? "deploy" : v === "org" ? "org" : "system";

// ── Syntax tab content (data-driven) ────────────────────────────────────────
// A code snippet, or the per-view kind table sourced from `getReference`. Moving
// these snippets out of branched JSX keeps them in one place (#1548). A future
// step could push them into core's reference payload next to `nodeKinds`.

type SyntaxSection = { heading: string; code: string } | { heading: string; kindTable: true };

const SYNTAX_CONTENT: Record<RefView, SyntaxSection[]> = {
  system: [
    {
      heading: "Block Declaration",
      code: `system "<name>" {
  // services, users, edges
}`,
    },
    { heading: "Node Kinds", kindTable: true },
    {
      heading: "Edge Syntax",
      code: `A ->  B "label"   // sync (solid arrow)
A --> B "label"   // async (dashed arrow)
A ->  B "label" #criticalWrite   // optional edge id (#<id>) — targetable via edge#<id> in .krs.style
// omitting #<id> → canonical id = <from><arrow><to>  (e.g. A->B / A-->B)`,
    },
    {
      heading: "Node Declaration",
      code: `// minimal (id only)
<kind> <id>

// with tags and annotations
<kind> <id> [<tags>] @<annotations>

// with block (properties and/or children)
<kind> <id> [<tags>] @<annotations> {
  label "<表示名>"        // display name; id used if omitted
  description "<説明>"    // free-form description
  // kind-specific properties (team, role, link, …)
}`,
    },
    {
      heading: "Resource Operations (CRUD)",
      code: `// Inside a usecase, a resource may declare the CRUD verbs the usecase
// performs on it: create | read | update | delete.
usecase PlaceOrder {
  resource OrderDB.OrderTable {
    operations create, read
  }
  // verb-decoration (1:N CRUD mapping): keep a domain verb, declare its CRUD intent
  resource OrderEvents.OrderPlaced {
    operations enqueue:create, dequeue:delete
  }
}`,
    },
    {
      heading: "Legend (footer)",
      code: `// Top-level. Renders as a footer band below each diagram view.
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
}`,
    },
  ],
  deploy: [
    {
      heading: "Block Declaration",
      code: `deploy "<name>" {
  // deploy units
}`,
    },
    { heading: "Deploy Unit Kinds", kindTable: true },
    {
      heading: "Unit Declaration",
      code: `<kind> <id> {
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
}`,
    },
  ],
  org: [
    {
      heading: "Block Declaration",
      code: `organization "<name>" {
  // teams
}`,
    },
    { heading: "Org Kinds", kindTable: true },
    {
      heading: "Node Declaration",
      code: `organization <id> {
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
}`,
    },
  ],
};

// Per-view `.krs.style` selector examples (the only `<pre>` in the Styles tab).
const STYLE_SELECTOR_EXAMPLES: Record<RefView, string> = {
  system: `/* system diagram selectors */
service { background-color: #0369A1; }
domain[external] { border-style: dashed; }
user[human] { shape: user; }
edge[async] { border-style: dashed; }
edge[write] { direction: down; }       /* layout-direction hint: up | down | left | right | auto */
edge#criticalWrite { color: #EF4444; } /* target one edge by id */
#ECommerce { background-color: #1D4ED8; }`,
  deploy: `/* deploy diagram selectors */
oci { background-color: #0369A1; }
jar { border-color: #075985; }
war { opacity: 0.8; }
#myUnit { background-color: #1D4ED8; }`,
  org: `/* org diagram selectors */
team { background-color: #0369A1; }
member { border-color: #075985; }
#myTeam { background-color: #1D4ED8; }`,
};

export function ReferencePanel({ isOpen, onClose, activeView = "system" }: ReferencePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("syntax");
  const { locale } = useTranslation();
  const ref = getReference(locale);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="reference-dialog flex max-h-[85vh] max-w-[760px] flex-col">
        <DialogHeader>
          <DialogTitle>Reference</DialogTitle>
        </DialogHeader>

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
              source={ref.sampleKrs}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      {SYNTAX_CONTENT[view].map((section) => (
        <Fragment key={section.heading}>
          <h3>{section.heading}</h3>
          {"code" in section ? (
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
        <pre>{STYLE_SELECTOR_EXAMPLES[refViewOf(activeView)]}</pre>
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
          <tr>
            <td>Edge ID</td>
            <td>
              <code>edge#criticalWrite</code>
            </td>
            <td>101</td>
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
