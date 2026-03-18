import { useState, useCallback } from "react";
import type { Project } from "@karasu/core";

interface ProjectSelectorProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
}

export function ProjectSelector({
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ProjectSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const project = projects.find((p) => p.id === e.target.value);
      if (project) onSelectProject(project);
    },
    [projects, onSelectProject]
  );

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreateProject(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  }, [newName, onCreateProject]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleCreate();
      if (e.key === "Escape") setIsCreating(false);
    },
    [handleCreate]
  );

  const handleDelete = useCallback(() => {
    if (currentProject && confirm(`"${currentProject.name}" を削除しますか?`)) {
      onDeleteProject(currentProject.id);
    }
  }, [currentProject, onDeleteProject]);

  return (
    <div className="project-selector">
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

      {isCreating ? (
        <div className="project-selector-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="プロジェクト名"
            autoFocus
            className="project-selector-input"
          />
          <button onClick={handleCreate} className="project-selector-btn">
            OK
          </button>
          <button
            onClick={() => setIsCreating(false)}
            className="project-selector-btn"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="project-selector-actions">
          <button
            onClick={() => setIsCreating(true)}
            className="project-selector-btn"
            title="新規プロジェクト"
          >
            + New
          </button>
          {currentProject && (
            <button
              onClick={handleDelete}
              className="project-selector-btn project-selector-btn-danger"
              title="プロジェクトを削除"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
