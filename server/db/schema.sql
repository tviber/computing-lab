-- Minimal Lab Runtime schema (SQLite / node:sqlite).
-- Mirrors the spec'd Prisma models one-to-one; naming is snake_case.
-- Additive changes only: bump PRAGMA user_version and add a step in migrations.ts.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  student_no    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'teacher', 'user')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS class_members (
  id       TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes (id),
  user_id  TEXT NOT NULL REFERENCES users (id),
  role     TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  UNIQUE (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS student_projects (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id),
  -- Snapshot of the class the project was started in. It is never
  -- re-resolved: a student who switches classes keeps their existing
  -- progress under the original class_id, by design.
  class_id            TEXT NOT NULL,
  lab_id              TEXT NOT NULL,
  current_stage       INTEGER NOT NULL DEFAULT 1,
  passed_stages       TEXT NOT NULL DEFAULT '[]',
  unlocked_submodules TEXT NOT NULL DEFAULT '[]',
  draft_graph         TEXT NOT NULL DEFAULT '{}',
  draft_revisions     TEXT NOT NULL DEFAULT '{}',
  project_generation  INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, lab_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES student_projects (id),
  user_id        TEXT NOT NULL REFERENCES users (id),
  lab_id         TEXT NOT NULL,
  stage_index    INTEGER NOT NULL,
  snapshot_graph TEXT NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  passed         INTEGER NOT NULL,
  test_summary   TEXT NOT NULL,
  submitted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- First guided CPU answer is an immutable event, separate from the final
-- answer set submitted for grading.
CREATE TABLE IF NOT EXISTS cpu_guided_first_answers (
  project_id  TEXT NOT NULL REFERENCES student_projects (id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL CHECK (stage_index > 0),
  prompt_id   TEXT NOT NULL,
  option_index INTEGER NOT NULL CHECK (option_index >= 0),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, stage_index, prompt_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calculator_full_adder_guide_acknowledgements (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE
);

-- Task sheets (任务单): teacher-owned worksheet templates. schema_json holds
-- the full question list INCLUDING grading data (accept lists, correct
-- options, reference answers) — students only ever receive the publicSchema()
-- projection that strips those fields.
CREATE TABLE IF NOT EXISTS task_sheets (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users (id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  schema_json   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Assignments snapshot the sheet schema at assign time so later template
-- edits can never invalidate already-collected answers.
CREATE TABLE IF NOT EXISTS task_assignments (
  id          TEXT PRIMARY KEY,
  sheet_id    TEXT REFERENCES task_sheets (id) ON DELETE SET NULL,
  class_id    TEXT NOT NULL REFERENCES classes (id),
  assigned_by TEXT NOT NULL REFERENCES users (id),
  title       TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  due_at      TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per student per assignment: draft answers → submitted → reviewed.
-- answers_json is student data only; grading_json/review_json are produced
-- server-side (grading authority lives here, same rule as lab judging).
CREATE TABLE IF NOT EXISTS task_responses (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES task_assignments (id),
  user_id        TEXT NOT NULL REFERENCES users (id),
  answers_json   TEXT NOT NULL DEFAULT '{}',
  auto_score     REAL,
  auto_total     REAL,
  grading_json   TEXT,
  review_json    TEXT,
  reviewed_by    TEXT,
  reviewed_at    TEXT,
  final_score    REAL,
  final_total    REAL,
  status         TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'submitted', 'reviewed', 'returned')),
  submitted_at   TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (assignment_id, user_id)
);

-- Per-lab visibility, managed by admins. A missing row means the lab is
-- open to every class. hidden = 1 makes the lab admin-only. When open,
-- open_class_ids scopes it: NULL means every class, a JSON array of class
-- ids means only members of those classes ('[]' = no class).
CREATE TABLE IF NOT EXISTS lab_settings (
  lab_id         TEXT PRIMARY KEY,
  hidden         INTEGER NOT NULL DEFAULT 0,
  open_class_ids TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Teacher-level per-class lab switch, layered under lab_settings: admins
-- still pick hidden/open and the class scope; a teacher can only close (or
-- reopen) a lab for a class they teach. open = 0 blocks the class's students
-- even when the admin scope admits it; a missing row means open.
CREATE TABLE IF NOT EXISTS lab_class_settings (
  lab_id     TEXT NOT NULL,
  class_id   TEXT NOT NULL REFERENCES classes (id),
  open       INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (lab_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_project_stage ON submissions (project_id, stage_index);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions (user_id, lab_id);
-- Dashboard lookup: latest submission per (user, lab, stage).
CREATE INDEX IF NOT EXISTS idx_submissions_user_stage
  ON submissions (user_id, lab_id, stage_index, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members (user_id);
CREATE INDEX IF NOT EXISTS idx_task_sheets_owner ON task_sheets (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_class ON task_assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_sheet ON task_assignments (sheet_id);
CREATE INDEX IF NOT EXISTS idx_task_responses_user ON task_responses (user_id);
