const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getDatabase } = require('../db/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Usuario y contrasenia son obligatorios'
      });
    }

    const db = await getDatabase();

    const user = await db.get(
      `
      SELECT
        id,
        name,
        username,
        password_hash,
        role,
        municipality_name,
        active
      FROM users
      WHERE username = ?
      `,
      [username]
    );

    if (!user || user.active !== 1) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales invalidas'
      });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales invalidas'
      });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      municipality_name: user.municipality_name
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
      }
    );

    return res.json({
      ok: true,
      message: 'Login correcto',
      token,
      token_type: 'Bearer',
      expires_in: process.env.JWT_EXPIRES_IN || '8h',
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        municipality_name: user.municipality_name
      }
    });
  } catch (error) {
    console.error('Error en login:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
