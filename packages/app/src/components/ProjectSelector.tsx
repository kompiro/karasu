import { useState, useCallback, useRef } from "react";
import type { Project } from "@karasu-tools/core";

interface ProjectSelectorProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onDeleteProject: (id: string) => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
}

export function ProjectSelector({
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onExportProject,
  onImportProject,
}: ProjectSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const project = projects.find((p) => p.id === e.target.value);
      if (project) onSelectProject(project);
    },
    [projects, onSelectProject],
  );

  // ── Create ────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreateProject(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  }, [newName, onCreateProject]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleCreate();
      if (e.key === "Escape") {
        setNewName("");
        setIsCreating(false);
      }
    },
    [handleCreate],
  );

  // ── Rename ────────────────────────────────────────────────────────

  const handleRenameStart = useCallback(() => {
    setRenameValue(currentProject?.name ?? "");
    setIsRenaming(true);
  }, [currentProject]);

  const handleRenameCommit = useCallback(() => {
    if (!currentProject) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== currentProject.name) {
      onRenameProject(currentProject.id, trimmed);
      setIsRenaming(false);
    }
  }, [currentProject, renameValue, onRenameProject]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleRenameCommit();
      if (e.key === "Escape") setIsRenaming(false);
    },
    [handleRenameCommit],
  );

  const isRenameOkDisabled = !renameValue.trim() || renameValue.trim() === currentProject?.name;

  // ── Import ────────────────────────────────────────────────────────

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onImportProject(file);
      e.target.value = "";
    },
    [onImportProject],
  );

  // ── Delete ────────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    if (currentProject && confirm(`"${currentProject.name}" を削除しますか?`)) {
      onDeleteProject(currentProject.id);
    }
  }, [currentProject, onDeleteProject]);

  // ── Render ────────────────────────────────────────────────────────

  const showInlineInput = isCreating || isRenaming;

  return (
    <div className="project-selector">
      {!showInlineInput && (
        <select
          value={currentProject?.id ?? ""}
          onChange={handleSelect}
          className="project-selector-dropdown"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {isCreating ? (
        <div className="project-selector-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            placeholder="プロジェクト名"
            autoFocus
            className="project-selector-input"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="project-selector-btn"
          >
            OK
          </button>
          <button
            onClick={() => {
              setNewName("");
              setIsCreating(false);
            }}
            className="project-selector-btn"
          >
            Cancel
          </button>
        </div>
      ) : isRenaming ? (
        <div className="project-selector-create">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            placeholder="プロジェクト名"
            autoFocus
            className="project-selector-input"
          />
          <button
            onClick={handleRenameCommit}
            disabled={isRenameOkDisabled}
            className="project-selector-btn"
          >
            OK
          </button>
          <button onClick={() => setIsRenaming(false)} className="project-selector-btn">
            Cancel
          </button>
        </div>
      ) : (
        <div className="project-selector-actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={handleImportFileChange}
          />
          <button
            onClick={() => setIsCreating(true)}
            className="project-selector-btn"
            title="新規プロジェクト"
          >
            + New
          </button>
          {currentProject && (
            <>
              <button
                onClick={handleRenameStart}
                className="project-selector-btn"
                title="プロジェクトをリネーム"
              >
                ✎ Rename
              </button>
              <button
                onClick={handleDelete}
                className="project-selector-btn project-selector-btn-danger"
                title="プロジェクトを削除"
              >
                ✕ Delete
              </button>
            </>
          )}
          <button
            onClick={onExportProject}
            disabled={!currentProject}
            className="project-selector-btn project-selector-btn--export"
            title="ZIPとしてエクスポート"
          >
            ↓ Export
          </button>
          <button
            onClick={handleImportClick}
            disabled={!currentProject}
            className="project-selector-btn project-selector-btn--import"
            title="ZIPからインポート"
          >
            ↑ Import
          </button>
        </div>
      )}
    </div>
  );
}
