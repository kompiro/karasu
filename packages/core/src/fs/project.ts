export interface Project {
  id: string;
  name: string;
  rootPath: string; // e.g., "/projects/{id}"
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
