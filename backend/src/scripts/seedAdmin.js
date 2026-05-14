const bcrypt = require('bcryptjs');
require('dotenv').config();

const { getDatabase } = require('../db/database');
const { initDatabase } = require('../db/schema');

async function seedAdmin() {
  const db = await getDatabase();

  await initDatabase();

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin1234!';

  const existingAdmin = await db.get(
    'SELECT id, username FROM users WHERE username = ?',
    [username]
  );

  if (existingAdmin) {
    console.log(`El usuario admin ya existe: ${existingAdmin.username}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.run(
    `
    INSERT INTO users (
      name,
      username,
      password_hash,
      role,
      municipality_name,
      active
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      'Admin Ministerio',
      username,
      passwordHash,
      'admin',
      null,
      1
    ]
  );

  console.log('Usuario admin creado correctamente');
  console.log(`Username: ${username}`);
  console.log(`Password inicial: ${password}`);
}

seedAdmin()
  .catch((error) => {
    console.error('Error creando admin inicial:', error);
    process.exit(1);
  });
