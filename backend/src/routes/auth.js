const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  authLimiter,
  registerLimiter,
  validatePassword,
  validateEmail,
} = require('../middleware/security');

const router = express.Router();

const BCRYPT_ROUNDS = 12;

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  if (!password) return res.status(400).json({ error: 'senha obrigatória' });

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ?',
    [email.trim().toLowerCase()]
  );
  const user = rows[0];

  // Resposta genérica para não vazar se email existe ou não
  if (!user) return res.status(401).json({ error: 'credenciais inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

  const isSuperAdmin = !!user.is_super_admin;
  const token = jwt.sign(
    { userId: user.id, companyId: user.company_id, role: user.role, isSuperAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // reduzido de 7d para 24h
  );
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email,
      companyId: user.company_id, isSuperAdmin,
    },
  });
});

router.post('/register', registerLimiter, async (req, res) => {
  const { companyName, name, email, password } = req.body || {};

  if (!companyName || !name) {
    return res.status(400).json({ error: 'campos obrigatórios ausentes' });
  }
  if (typeof companyName !== 'string' || companyName.trim().length < 2) {
    return res.status(400).json({ error: 'nome da empresa deve ter ao menos 2 caracteres' });
  }
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'nome deve ter ao menos 2 caracteres' });
  }

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ error: passwordErr });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [c] = await conn.query('INSERT INTO companies (name, plan) VALUES (?, "free")', [companyName.trim()]);
    const companyId = c.insertId;
    await conn.query('INSERT INTO settings (company_id) VALUES (?)', [companyId]);
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [u] = await conn.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, "owner")',
      [companyId, name.trim(), email.trim().toLowerCase(), hash]
    );
    await conn.commit();
    const token = jwt.sign(
      { userId: u.insertId, companyId, role: 'owner', isSuperAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: u.insertId, name: name.trim(), email: email.trim().toLowerCase(), companyId, isSuperAdmin: false } });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email já cadastrado' });
    res.status(500).json({ error: 'erro ao criar conta' });
  } finally {
    conn.release();
  }
});

module.exports = router;
