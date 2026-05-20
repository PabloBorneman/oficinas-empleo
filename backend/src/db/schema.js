const { getDatabase } = require('./database');

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName});`);
  return columns.some((column) => column.name === columnName);
}

async function addColumnIfNotExists(db, tableName, columnName, definition) {
  const exists = await columnExists(db, tableName, columnName);

  if (!exists) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

async function initDatabase() {
  const db = await getDatabase();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'municipio')),
      municipality_name TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'text',
          'number',
          'select',
          'multiselect',
          'boolean',
          'date',
          'textarea'
        )
      ),
      options TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      field_order INTEGER NOT NULL DEFAULT 0,
      chart_type TEXT NOT NULL DEFAULT 'auto',
      include_in_report INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS form_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(form_id, user_id),
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      municipality_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submission_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES form_fields(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_form_fields_form_id
    ON form_fields(form_id);

    CREATE INDEX IF NOT EXISTS idx_form_assignments_form_id
    ON form_assignments(form_id);

    CREATE INDEX IF NOT EXISTS idx_form_assignments_user_id
    ON form_assignments(user_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_form_id
    ON submissions(form_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_user_id
    ON submissions(user_id);

    CREATE INDEX IF NOT EXISTS idx_submission_values_submission_id
    ON submission_values(submission_id);

    CREATE INDEX IF NOT EXISTS idx_submission_values_field_id
    ON submission_values(field_id);
  `);

  await addColumnIfNotExists(
    db,
    'form_fields',
    'chart_type',
    "TEXT NOT NULL DEFAULT 'auto'"
  );

  await addColumnIfNotExists(
    db,
    'form_fields',
    'include_in_report',
    'INTEGER NOT NULL DEFAULT 1'
  );
  await addColumnIfNotExists(
    db,
    'forms',
    'scope',
    "TEXT NOT NULL DEFAULT 'official'"
  );

  await addColumnIfNotExists(
    db,
    'forms',
    'status',
    "TEXT NOT NULL DEFAULT 'active'"
  );

  await addColumnIfNotExists(
    db,
    'forms',
    'owner_user_id',
    'INTEGER'
  );

  await addColumnIfNotExists(
    db,
    'forms',
    'allow_self_assignment',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await db.run(`
    UPDATE forms
    SET
      scope = COALESCE(scope, 'official'),
      status = COALESCE(status, 'active'),
      allow_self_assignment = CASE
        WHEN scope = 'official' THEN 1
        ELSE allow_self_assignment
      END
    WHERE id IS NOT NULL;
  `);
}

module.exports = {
  initDatabase
};

