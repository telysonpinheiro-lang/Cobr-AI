import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

function brl(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

function formatPhone(p) {
  const s = String(p || '').replace(/\D/g, '');
  const m = s.match(/^55(\d{2})(\d{4,5})(\d{4})$/) || s.match(/^(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return p || '';
  return s.startsWith('55')
    ? `(${m[1]}) ${m[2]}-${m[3]}`
    : `(${m[1]}) ${m[2]}-${m[3]}`;
}

function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : '';
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function phoneDigits(v) { return v.replace(/\D/g, ''); }

export default function DebtorDetail() {
  const { id } = useParams();
  const [data, setData]             = useState(null);
  const [text, setText]             = useState('');
  const [error, setError]           = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone]     = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [protesting, setProtesting] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try { setData(await api.debtor(id)); }
    catch (err) { setError(err.message); }
  }

  function startEditPhone() {
    setNewPhone(formatPhone(data.debtor.phone));
    setPhoneError('');
    setEditingPhone(true);
  }

  async function savePhone() {
    const digits = phoneDigits(newPhone);
    if (digits.length < 11) {
      setPhoneError('Digite DDD + 9 dígitos. Ex: (11) 91234-5678');
      return;
    }
    setPhoneSaving(true);
    setPhoneError('');
    try {
      await api.updatePhone(id, newPhone);
      setEditingPhone(false);
      load();
    } catch (err) {
      setPhoneError(err.message);
    } finally {
      setPhoneSaving(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    await api.sendMessage(id, text);
    setText('');
    load();
  }

  async function generatePayment() {
    await api.createPayment(id);
    load();
  }

  async function sendToProtest() {
    if (!window.confirm('Enviar notificação jurídica para este devedor?')) return;
    setProtesting(true);
    try {
      await api.sendToProtest(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setProtesting(false);
    }
  }

  async function confirm(paymentId) {
    await api.confirmPayment(id, paymentId);
    load();
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Carregando...</p>;
  const { debtor, messages, deals, payments, dunningSteps = [] } = data;

  const canProtest = dunningSteps.includes('d3')
    && !['pago', 'em_protesto', 'ignorado'].includes(debtor.status);

  return (
    <div>
      <Link to="/debtors">← voltar</Link>
      <h2>{debtor.name}</h2>

      <div className="cards">
        <div className="card">
          <div className="label">Telefone</div>
          {editingPhone ? (
            <div style={{ marginTop: 6 }}>
              <input
                style={{ fontSize: 16, width: '100%', marginBottom: 6 }}
                value={newPhone}
                onChange={(e) => setNewPhone(maskPhone(e.target.value))}
                placeholder="(11) 91234-5678"
                autoFocus
              />
              {phoneError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 6 }}>{phoneError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={savePhone} disabled={phoneSaving} style={{ padding: '4px 12px', fontSize: 13 }}>
                  {phoneSaving ? 'Salvando...' : 'Salvar'}
                </button>
                <button onClick={() => setEditingPhone(false)} className="secondary" style={{ padding: '4px 12px', fontSize: 13 }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="value" style={{ fontSize: 18 }}>{formatPhone(debtor.phone)}</span>
              <button
                onClick={startEditPhone}
                className="secondary"
                style={{ padding: '2px 10px', fontSize: 12, marginTop: 2 }}
              >
                Editar
              </button>
            </div>
          )}
        </div>
        <div className="card warning">
          <div className="label">Valor</div>
          <div className="value">{brl(debtor.amount)}</div>
        </div>
        <div className="card">
          <div className="label">Vencimento</div>
          <div className="value" style={{ fontSize: 18 }}>{debtor.due_date}</div>
        </div>
        <div className="card">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: 16 }}>
            <span className={`badge ${debtor.status}`}>{debtor.status.replace(/_/g, ' ')}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Conversa WhatsApp</h3>
        <div className="chat">
          {messages.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma mensagem ainda.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.direction}`}>
              <div className="bubble">
                {m.body}
                <span className="time">{m.created_at}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input
            placeholder="Digite uma mensagem (ou deixe vazio p/ usar template)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button onClick={send} style={{ flex: 0 }}>Enviar</button>
          <button className="secondary" onClick={generatePayment} style={{ flex: 0 }}>
            Gerar PIX
          </button>
        </div>

        {canProtest && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={sendToProtest}
              disabled={protesting}
              style={{ background: '#dc2626', color: '#fff', border: 'none' }}
            >
              {protesting ? 'Enviando...' : '⚖️ Enviar para protesto'}
            </button>
            <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--muted)' }}>
              Envia notificação de encaminhamento jurídico via WhatsApp
            </span>
          </div>
        )}
      </div>

      {deals.length > 0 && (
        <div className="panel">
          <h3>Acordos</h3>
          <table>
            <thead><tr><th>Original</th><th>Final</th><th>Desconto</th><th>Parcelas</th><th>Status</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>{brl(d.original_amount)}</td>
                  <td>{brl(d.final_amount)}</td>
                  <td>{d.discount_pct}%</td>
                  <td>{d.installments}x</td>
                  <td>{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length > 0 && (
        <div className="panel">
          <h3>Pagamentos</h3>
          <table>
            <thead><tr><th>Valor</th><th>Método</th><th>Link</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{brl(p.amount)}</td>
                  <td>{p.method}</td>
                  <td><a href={p.link} target="_blank" rel="noreferrer">abrir</a></td>
                  <td>{p.status}</td>
                  <td>
                    {p.status === 'pendente' && (
                      <button onClick={() => confirm(p.id)} style={{ padding: '4px 10px' }}>
                        marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
