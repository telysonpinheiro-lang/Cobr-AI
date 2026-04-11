import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function brl(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

function formatPhone(p) {
  const s = String(p || '');
  const m = s.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return s;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export default function ClientDetail() {
  const { phone } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => { load(); }, [phone]);

  async function load() {
    try {
      const res = await api.client(phone);
      setData(res);
      setNewName(res.client.name);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteClient() {
    if (!confirm(`Excluir "${data.client.name}"?\n\nRemove o cliente e todo o histórico. Irreversível.`)) return;
    await api.deleteClient(phone);
    navigate('/clients');
  }

  async function saveName() {
    if (!newName.trim()) return;
    await api.renameClient(phone, newName.trim());
    setEditing(false);
    load();
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Carregando...</p>;
  const { client, debts, messages, payments } = data;

  return (
    <div>
      <Link to="/clients">← voltar para clientes</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {editing ? (
          <div className="row" style={{ flex: 1, maxWidth: 500 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button onClick={saveName} style={{ flex: 0 }}>Salvar</button>
            <button className="secondary" onClick={() => setEditing(false)} style={{ flex: 0 }}>
              Cancelar
            </button>
          </div>
        ) : (
          <h2 style={{ margin: 0 }}>
            {client.name}{' '}
            <button
              className="secondary"
              style={{ padding: '4px 10px', fontSize: 12, marginLeft: 8 }}
              onClick={() => setEditing(true)}
            >
              editar nome
            </button>
          </h2>
        )}
        <button
          className="danger"
          style={{ padding: '6px 14px', fontSize: 13 }}
          onClick={deleteClient}
        >
          🗑 Excluir cliente
        </button>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>{formatPhone(client.phone)}</p>

      <div className="cards">
        <div className="card">
          <div className="label">Dívidas cadastradas</div>
          <div className="value">{client.debts_count}</div>
        </div>
        <div className="card warning">
          <div className="label">Em aberto</div>
          <div className="value">{brl(client.open_amount)}</div>
        </div>
        <div className="card success">
          <div className="label">Recuperado</div>
          <div className="value">{brl(client.paid_amount)}</div>
        </div>
        <div className="card">
          <div className="label">Total histórico</div>
          <div className="value">{brl(client.total_amount)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Dívidas deste cliente</h3>
        <table>
          <thead>
            <tr>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Parcelas</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.id}>
                <td>{brl(d.amount)}</td>
                <td>{d.due_date}</td>
                <td>{d.installments}x</td>
                <td><span className={`badge ${d.status}`}>{d.status.replace(/_/g, ' ')}</span></td>
                <td><Link to={`/debtors/${d.id}`}>abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {messages.length > 0 && (
        <div className="panel">
          <h3>Últimas mensagens</h3>
          <div className="chat">
            {messages.slice().reverse().map((m) => (
              <div key={m.id} className={`msg ${m.direction}`}>
                <div className="bubble">
                  {m.body}
                  <span className="time">{m.created_at}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="panel">
          <h3>Pagamentos</h3>
          <table>
            <thead><tr><th>Valor</th><th>Método</th><th>Status</th><th>Link</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{brl(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>{p.status}</td>
                  <td><a href={p.link} target="_blank" rel="noreferrer">abrir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
