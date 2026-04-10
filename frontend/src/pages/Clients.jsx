import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPhone(p) {
  // 5511912345678 -> (11) 91234-5678
  const s = String(p || '');
  const m = s.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return s;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

export default function Clients() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      setList(await api.clients(params));
    } finally {
      setLoading(false);
    }
  }

  async function deleteClient(c) {
    if (!confirm(`Excluir "${c.name}"?\n\nRemove o cliente e todo o histórico de dívidas, mensagens e pagamentos. Irreversível.`)) return;
    await api.deleteClient(c.phone);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Clientes cadastrados</h2>
        <Link to="/upload"><button>+ Novo cliente</button></Link>
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 16 }}>
          <input
            placeholder="Buscar por nome ou telefone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button onClick={load} style={{ flex: 0 }}>Buscar</button>
        </div>

        {loading ? <p>Carregando...</p> : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Dívidas</th>
                <th>Em aberto</th>
                <th>Recuperado</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.phone}>
                  <td>{c.name}</td>
                  <td>{formatPhone(c.phone)}</td>
                  <td>
                    {c.debts_count}
                    {c.open_count > 0 && (
                      <span style={{ color: 'var(--warning)' }}> · {c.open_count} aberta(s)</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--warning)' }}>{brl(c.open_amount)}</td>
                  <td style={{ color: 'var(--accent)' }}>{brl(c.paid_amount)}</td>
                  <td>{brl(c.total_amount)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Link to={`/clients/${encodeURIComponent(c.phone)}`}>abrir</Link>
                      <button
                        className="danger"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                        onClick={() => deleteClient(c)}
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  Nenhum cliente cadastrado.{' '}
                  <Link to="/upload">Cadastre o primeiro</Link>.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
