const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
require('dotenv').config();

let db = null;

async function getDatabase() {
  if (db) {
    return db;
  }

  const dbPath = process.env.DB_PATH || './data/oficinas_empleo.db';
  const fullPath = path.resolve(dbPath);

  db = await open({
    filename: fullPath,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON;');

  return db;
}

module.exports = {
  getDatabase
};
