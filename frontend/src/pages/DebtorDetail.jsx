import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DebtorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [id]);

  async function load() {
    try { setData(await api.debtor(id)); }
    catch (err) { setError(err.message); }
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

  async function confirm(paymentId) {
    await api.confirmPayment(id, paymentId);
    load();
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Carregando...</p>;
  const { debtor, messages, deals, payments } = data;

  return (
    <div>
      <Link to="/debtors">← voltar</Link>
      <h2>{debtor.name}</h2>

      <div className="cards">
        <div className="card">
          <div className="label">Telefone</div>
          <div className="value" style={{ fontSize: 18 }}>{debtor.phone}</div>
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
