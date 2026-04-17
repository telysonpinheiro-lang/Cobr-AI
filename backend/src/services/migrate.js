// Migrações idempotentes que rodam no boot.
// Usa INFORMATION_SCHEMA para verificar se a coluna já existe antes de
// executar o ALTER, então é seguro rodar sempre.

const pool = require('../config/db');

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    console.log(`[migrate] +${table}.${column}`);
  }
}

async function ensureTable(name, ddl) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [name]
  );
  if (!rows.length) {
    await pool.query(ddl);
    console.log(`[migrate] +table ${name}`);
  }
}

async function runMigrations() {
  try {
    // Billing + status + providers por empresa
    await ensureColumn('companies', 'status',
      `status ENUM('active','suspended') DEFAULT 'active'`);
    await ensureColumn('companies', 'monthly_price',
      `monthly_price DECIMAL(10,2) DEFAULT 0`);
    await ensureColumn('companies', 'whatsapp_provider',
      `whatsapp_provider VARCHAR(20) DEFAULT NULL`);
    await ensureColumn('companies', 'payment_provider',
      `payment_provider VARCHAR(20) DEFAULT NULL`);
    await ensureColumn('companies', 'openai_api_key',
      `openai_api_key TEXT DEFAULT NULL`);
    await ensureColumn('companies', 'openai_model',
      `openai_model VARCHAR(50) DEFAULT NULL`);
    await ensureColumn('companies', 'revenue_share',
      `revenue_share DECIMAL(5,2) DEFAULT 0 COMMENT '% sobre valor recuperado'`);

    // Credenciais Evolution API por empresa
    await ensureColumn('companies', 'evolution_base_url',
      `evolution_base_url VARCHAR(255) DEFAULT NULL`);
    await ensureColumn('companies', 'evolution_api_key',
      `evolution_api_key TEXT DEFAULT NULL`);
    await ensureColumn('companies', 'evolution_instance',
      `evolution_instance VARCHAR(100) DEFAULT NULL`);

    // Super admin (vê todas as empresas)
    await ensureColumn('users', 'is_super_admin',
      `is_super_admin TINYINT(1) DEFAULT 0`);

    // Adiciona step 'pre' (lembrete pré-vencimento) ao enum do dunning_log
    const [[enumRow]] = await pool.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'dunning_log'
         AND COLUMN_NAME  = 'step'
    `);
    if (enumRow && !String(enumRow.COLUMN_TYPE).includes("'pre'")) {
      await pool.query(`
        ALTER TABLE dunning_log
          MODIFY COLUMN step ENUM('pre','d1','d2','d3') NOT NULL
      `);
      console.log('[migrate] dunning_log.step +pre');
    }

    // Status em_protesto para devedores encaminhados para jurídico
    const [[statusCol]] = await pool.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'debtors'
         AND COLUMN_NAME  = 'status'
    `);
    if (statusCol && !String(statusCol.COLUMN_TYPE).includes("'em_protesto'")) {
      await pool.query(`
        ALTER TABLE debtors
          MODIFY COLUMN status ENUM(
            'nao_contatado','em_conversa','negociando',
            'aguardando_pagamento','pago','ignorado','em_protesto'
          ) DEFAULT 'nao_contatado'
      `);
      console.log('[migrate] debtors.status +em_protesto');
    }

    // Data prometida de pagamento (capturada na conversa D+2)
    await ensureColumn('debtors', 'promised_date',
      `promised_date DATE NULL DEFAULT NULL`);

    // Chave PIX da empresa (para geração de links de pagamento)
    await ensureColumn('companies', 'pix_key_type',
      `pix_key_type ENUM('cpf','cnpj','email','telefone','aleatoria') DEFAULT NULL`);
    await ensureColumn('companies', 'pix_key',
      `pix_key VARCHAR(150) DEFAULT NULL`);

    // Garante linha em settings para todas as empresas (evita falha no UPDATE)
    await pool.query(`
      INSERT INTO settings (company_id)
      SELECT c.id FROM companies c
        LEFT JOIN settings s ON s.company_id = c.id
       WHERE s.company_id IS NULL
    `);

    // Log de execuções do scheduler (observabilidade)
    await ensureTable('scheduler_runs', `
      CREATE TABLE scheduler_runs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        total_sent  INT          DEFAULT 0,
        total_errors INT         DEFAULT 0,
        duration_ms INT          DEFAULT 0,
        ran_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ran_at (ran_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('[migrate] falhou:', err.message);
  }
}

module.exports = { runMigrations };
