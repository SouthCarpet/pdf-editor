CREATE TABLE recent_files (
  path TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  last_opened_at TIMESTAMP NOT NULL,
  page_count INTEGER,
  size_bytes INTEGER
);
CREATE INDEX idx_recent_files_opened ON recent_files(last_opened_at DESC);

CREATE TABLE pipeline_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  graph_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE project_files (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  added_at TIMESTAMP NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE project_pipelines (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  preset_id INTEGER NOT NULL REFERENCES pipeline_presets(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, preset_id)
);

CREATE TABLE autosave (
  doc_path TEXT PRIMARY KEY,
  patch_json TEXT NOT NULL,
  saved_at TIMESTAMP NOT NULL
);

CREATE TABLE last_session (
  slot INTEGER PRIMARY KEY,
  doc_path TEXT NOT NULL,
  tool TEXT NOT NULL,
  scroll_y INTEGER NOT NULL,
  zoom REAL NOT NULL
);

CREATE TABLE jobs_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  input_paths TEXT NOT NULL,
  output_paths TEXT,
  error_message TEXT
);
