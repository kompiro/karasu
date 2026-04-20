import { useState, useCallback, useRef } from "react";
import type { Project } from "@karasu-tools/core";
import { useTranslation } from "../i18n/index.js";

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
  const { t } = useTranslation();
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
    if (
      currentProject &&
      confirm(t("projectSelector.delete.confirm", { name: currentProject.name }))
    ) {
      onDeleteProject(currentProject.id);
    }
  }, [currentProject, onDeleteProject, t]);

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
            placeholder={t("projectSelector.namePlaceholder")}
            autoFocus
            className="project-selector-input"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="project-selector-btn"
          >
            {t("projectSelector.ok")}
          </button>
          <button
            onClick={() => {
              setNewName("");
              setIsCreating(false);
            }}
            className="project-selector-btn"
          >
            {t("projectSelector.cancel")}
          </button>
        </div>
      ) : isRenaming ? (
        <div className="project-selector-create">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            placeholder={t("projectSelector.namePlaceholder")}
            autoFocus
            className="project-selector-input"
          />
          <button
            onClick={handleRenameCommit}
            disabled={isRenameOkDisabled}
            className="project-selector-btn"
          >
            {t("projectSelector.ok")}
          </button>
          <button onClick={() => setIsRenaming(false)} className="project-selector-btn">
            {t("projectSelector.cancel")}
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
            title={t("projectSelector.new.title")}
          >
            {t("projectSelector.new.button")}
          </button>
          {currentProject && (
            <>
              <button
                onClick={handleRenameStart}
                className="project-selector-btn"
                title={t("projectSelector.rename.title")}
              >
                {t("projectSelector.rename.button")}
              </button>
              <button
                onClick={handleDelete}
                className="project-selector-btn project-selector-btn-danger"
                title={t("projectSelector.delete.title")}
              >
                {t("projectSelector.delete.button")}
              </button>
            </>
          )}
          <button
            onClick={onExportProject}
            disabled={!currentProject}
            className="project-selector-btn project-selector-btn--export"
            title={t("projectSelector.export.title")}
          >
            {t("projectSelector.export.button")}
          </button>
          <button
            onClick={handleImportClick}
            disabled={!currentProject}
            className="project-selector-btn project-selector-btn--import"
            title={t("projectSelector.import.title")}
          >
            {t("projectSelector.import.button")}
          </button>
        </div>
      )}
    </div>
  );
}
