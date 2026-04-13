const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const {
  normalizePhone, parseAmount, parseDate, parseInstallments,
} = require('./validators');

// Mapeia variações comuns dos cabeçalhos para os campos canônicos.
const HEADER_MAP = {
  nome: 'name', name: 'name', cliente: 'name',
  telefone: 'phone', phone: 'phone', whatsapp: 'phone', celular: 'phone',
  valor: 'amount', amount: 'amount', divida: 'amount', 'valor da divida': 'amount',
  vencimento: 'due_date', due_date: 'due_date', 'data de vencimento': 'due_date', data: 'due_date',
  parcelamento: 'installments', parcelas: 'installments', installments: 'installments',
};

function normalizeKey(k) {
  return String(k || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function rowsFromBuffer(buffer, originalName = '') {
  const ext = originalName.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const rows = [];
    let headers = [];
    sheet.eachRow((row, rowNum) => {
      const values = row.values.slice(1); // eachRow inclui índice 0 vazio
      if (rowNum === 1) {
        headers = values.map((v) => String(v || ''));
      } else {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
        rows.push(obj);
      }
    });
    return rows;
  }
  // CSV (default)
  return parse(buffer.toString('utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

async function parseDebtorsFile(buffer, originalName) {
  const rows = await rowsFromBuffer(buffer, originalName);
  const seen = new Set();
  const valid = [];
  const errors = [];

  rows.forEach((raw, i) => {
    const row = {};
    for (const k of Object.keys(raw)) {
      const canonical = HEADER_MAP[normalizeKey(k)];
      if (canonical) row[canonical] = raw[k];
    }

    const name = String(row.name || '').trim();
    const phone = normalizePhone(row.phone);
    const amount = parseAmount(row.amount);
    const dueDate = parseDate(row.due_date);
    const installments = parseInstallments(row.installments);

    const lineErrors = [];
    if (!name) lineErrors.push('nome ausente');
    if (!phone) lineErrors.push('telefone inválido');
    if (!amount) lineErrors.push('valor inválido');
    if (!dueDate) lineErrors.push('data de vencimento inválida');

    if (lineErrors.length) {
      errors.push({ line: i + 2, errors: lineErrors });
      return;
    }
    if (seen.has(phone)) {
      errors.push({ line: i + 2, errors: ['telefone duplicado no arquivo'] });
      return;
    }
    seen.add(phone);

    valid.push({ name, phone, amount, due_date: dueDate, installments });
  });

  return { valid, errors };
}

module.exports = { parseDebtorsFile };
