// Validação simples de telefone BR (com DDD).
// Aceita: (11) 91234-5678, 11912345678, +5511912345678 etc.
function normalizePhone(raw) {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, '');
  // remove código do país se vier
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('55')) digits = digits.slice(2);
  // exige DDD (2) + número (8 ou 9)
  if (digits.length < 10 || digits.length > 11) return null;
  return '55' + digits; // padrão E.164 sem '+'
}

function parseAmount(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // aceita "1.234,56" ou "1234.56"
  const cleaned = String(raw).replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseDate(raw) {
  if (!raw) return null;
  // aceita ISO ou DD/MM/YYYY
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseInstallments(raw) {
  if (raw == null || raw === '') return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

module.exports = { normalizePhone, parseAmount, parseDate, parseInstallments };
