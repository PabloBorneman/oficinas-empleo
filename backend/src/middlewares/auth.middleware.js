const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      ok: false,
      message: 'Token no enviado'
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      ok: false,
      message: 'Formato de token invalido'
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Token invalido o expirado'
    });
  }
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        ok: false,
        message: 'No tenes permisos para acceder a este recurso'
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
