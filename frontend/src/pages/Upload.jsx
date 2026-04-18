import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const EMPTY_FORM = {
  name: '',
  phone: '',
  amount: '',
  due_date: '',
  installments: 1,
};

function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : '';
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function phoneWarn(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  if (d.length < 11) return 'Celular precisa ter DDD + 9 dígitos. Ex: (35) 99733-3909';
  return '';
}

function maskAmount(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  const num = (parseInt(d, 10) / 100).toFixed(2);
  const [int, dec] = num.split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFmt},${dec}`;
}

export default function Upload() {
  const [tab, setTab] = useState('manual'); // 'manual' | 'file'
  const navigate = useNavigate();

  // ----- upload de arquivo -----
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submitFile(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.uploadDebtors(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ----- cadastro manual -----
  const [form, setForm] = useState(EMPTY_FORM);
  const [manualMsg, setManualMsg] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  function update(k, v) {
    setForm({ ...form, [k]: v });
  }

  function normalizePayload(f) {
    // converte "1.234,56" -> 1234.56
    let amount = String(f.amount).trim();
    if (amount.includes(',')) {
      amount = amount.replace(/\./g, '').replace(',', '.');
    }
    return {
      name: f.name.trim(),
      phone: f.phone.trim(),
      amount: Number(amount),
      due_date: f.due_date,
      installments: Number(f.installments) || 1,
    };
  }

  async function submitManual(e) {
    e.preventDefault();
    setManualLoading(true);
    setManualMsg('');
    setManualError('');
    try {
      const payload = normalizePayload(form);
      if (!payload.name || !payload.phone || !payload.amount || !payload.due_date) {
        throw new Error('Preencha todos os campos obrigatórios');
      }
      const res = await api.createDebtor(payload);
      setManualMsg(`✓ Cliente cadastrado (id ${res.id})`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setManualError(err.message);
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div>
      <h2>Importar inadimplentes</h2>

      <div className="tabs">
        <button
          className={`tab ${tab === 'manual' ? 'active' : ''}`}
          onClick={() => setTab('manual')}
        >
          Cadastro manual
        </button>
        <button
          className={`tab ${tab === 'file' ? 'active' : ''}`}
          onClick={() => setTab('file')}
        >
          Importar planilha
        </button>
      </div>

      {tab === 'file' && (
        <div className="panel">
          <p style={{ color: 'var(--muted)' }}>
            Envie um arquivo <strong>CSV</strong> ou <strong>Excel</strong> com as colunas:
          </p>
          <ul style={{ color: 'var(--muted)' }}>
            <li><code>nome</code> — nome do cliente</li>
            <li><code>telefone</code> — WhatsApp com DDD (ex: (11) 91234-5678)</li>
            <li><code>valor</code> — valor <strong>total</strong> da dívida (ex: 250,00). Se houver parcelamento, a cobrança será feita no valor da parcela.</li>
            <li><code>vencimento</code> — data de vencimento (DD/MM/AAAA ou AAAA-MM-DD)</li>
            <li><code>parcelamento</code> — número de parcelas (opcional, padrão 1)</li>
          </ul>

          <form onSubmit={submitFile} style={{ marginTop: 16 }}>
            <div className="field">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </div>
            <button type="submit" disabled={!file || loading}>
              {loading ? 'Enviando...' : 'Importar'}
            </button>
          </form>

          {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

          {result && (
            <div style={{ marginTop: 16 }}>
              <div className="success">
                ✓ {result.inserted} importados, {result.duplicates} duplicados,
                {' '}{result.errors.length} com erro
              </div>
              {result.errors.length > 0 && (
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr><th>Linha</th><th>Erros</th></tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i}><td>{e.line}</td><td>{e.errors.join(', ')}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 12 }}>
                <button className="secondary" onClick={() => navigate('/debtors')}>
                  Ver inadimplentes
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div className="panel">
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Cadastre um cliente inadimplente manualmente. Os mesmos campos da planilha.
          </p>

          <form onSubmit={submitManual}>
            <div className="field">
              <label>Nome do cliente *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ex: Maria Silva"
                required
              />
            </div>

            <div className="row">
              <div className="field">
                <label>Telefone (WhatsApp com DDD) *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', maskPhone(e.target.value))}
                  placeholder="(11) 91234-5678"
                  required
                />
                {phoneWarn(form.phone) && (
                  <span style={{ color: '#d97706', fontSize: 12, marginTop: 4, display: 'block' }}>
                    ⚠ {phoneWarn(form.phone)}
                  </span>
                )}
              </div>
              <div className="field">
                <label>Valor total da dívida (R$) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => update('amount', maskAmount(e.target.value))}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Data de vencimento *</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => update('due_date', e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Parcelamento</label>
                <input
                  type="number"
                  min="1"
                  value={form.installments}
                  onChange={(e) => update('installments', e.target.value)}
                />
                {(() => {
                  const raw = String(form.amount || '').replace(/\./g, '').replace(',', '.');
                  const totalNum = Number(raw);
                  const n        = Number(form.installments) || 1;
                  if (!totalNum || n <= 1) return null;
                  const parcela = (totalNum / n).toFixed(2).replace('.', ',');
                  return (
                    <span style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4, display: 'block' }}>
                      Cobrança da parcela: R$ {parcela}
                    </span>
                  );
                })()}
              </div>
            </div>

            {manualError && <div className="error">{manualError}</div>}
            {manualMsg && <div className="success">{manualMsg}</div>}

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button type="submit" disabled={manualLoading}>
                {manualLoading ? 'Cadastrando...' : 'Cadastrar cliente'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(EMPTY_FORM)}
              >
                Limpar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => navigate('/debtors')}
              >
                Ver inadimplentes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
