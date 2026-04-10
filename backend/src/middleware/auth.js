const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'token ausente' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, companyId, role, isSuperAdmin }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'token inválido' });
  }
}

function superAdminRequired(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'apenas super admin' });
  }
  next();
}

module.exports = { authRequired, superAdminRequired };
