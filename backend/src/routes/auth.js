const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatórios' });

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'credenciais inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

  const isSuperAdmin = !!user.is_super_admin;
  const token = jwt.sign(
    { userId: user.id, companyId: user.company_id, role: user.role, isSuperAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email,
      companyId: user.company_id, isSuperAdmin,
    },
  });
});

router.post('/register', async (req, res) => {
  const { companyName, name, email, password } = req.body || {};
  if (!companyName || !name || !email || !password) {
    return res.status(400).json({ error: 'campos obrigatórios ausentes' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [c] = await conn.query('INSERT INTO companies (name, plan) VALUES (?, "free")', [companyName]);
    const companyId = c.insertId;
    await conn.query('INSERT INTO settings (company_id) VALUES (?)', [companyId]);
    const hash = await bcrypt.hash(password, 10);
    const [u] = await conn.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, "owner")',
      [companyId, name, email, hash]
    );
    await conn.commit();
    const token = jwt.sign(
      { userId: u.insertId, companyId, role: 'owner', isSuperAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: u.insertId, name, email, companyId, isSuperAdmin: false } });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email já cadastrado' });
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
