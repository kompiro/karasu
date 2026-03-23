import { useState, useCallback } from "react";
import { getReference } from "@karasu/core";

interface ReferencePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "syntax" | "styles" | "tags" | "builtin";

const TAB_LABELS: Record<Tab, string> = {
  syntax: "Syntax",
  styles: "Styles",
  tags: "Tags & Annotations",
  builtin: "Built-in Theme",
};

export function ReferencePanel({ isOpen, onClose }: ReferencePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("syntax");
  const [copied, setCopied] = useState(false);

  const ref = getReference();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(ref.builtinStyleSource).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [ref.builtinStyleSource]);

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
          {activeTab === "syntax" && <SyntaxTab />}
          {activeTab === "styles" && <StylesTab />}
          {activeTab === "tags" && <TagsTab />}
          {activeTab === "builtin" && (
            <BuiltinTab source={ref.builtinStyleSource} onCopy={handleCopy} copied={copied} />
          )}
        </div>
      </div>
    </div>
  );
}

function SyntaxTab() {
  const ref = getReference();
  return (
    <div className="reference-tab-body">
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
        <pre>{`<kind> <id> "<label>" "<description>" [<tags>] @<annotations>`}</pre>
      </div>
    </div>
  );
}

function StylesTab() {
  const ref = getReference();
  return (
    <div className="reference-tab-body">
      <h3>Selector Syntax</h3>
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

function TagsTab() {
  const ref = getReference();
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
          {ref.tags.map((t) => (
            <tr key={t.name}>
              <td>
                <code>[{t.name}]</code>
              </td>
              <td>{t.appliesTo.join(", ")}</td>
              <td>{t.description}</td>
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
  return (
    <div className="reference-tab-body">
      <div className="reference-builtin-header">
        <span>Built-in default theme (lowest cascade priority)</span>
        <button className="reference-copy-btn" onClick={onCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="reference-code-block">
        <pre>{source}</pre>
      </div>
    </div>
  );
}
