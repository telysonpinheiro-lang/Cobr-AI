import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_OPTS = [
  { v: '',                     l: 'Todos' },
  { v: 'nao_contatado',        l: 'Não contatado' },
  { v: 'em_conversa',          l: 'Em conversa' },
  { v: 'negociando',           l: 'Negociando' },
  { v: 'aguardando_pagamento', l: 'Aguardando pagamento' },
  { v: 'pago',                 l: 'Pago' },
  { v: 'ignorado',             l: 'Ignorado' },
];

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

export default function Debtors() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { load(); }, [status]);

  async function load() {
    const params = {};
    if (status) params.status = status;
    if (q) params.q = q;
    setList(await api.debtors(params));
  }

  return (
    <div>
      <h2>Inadimplentes</h2>

      <div className="panel">
        <div className="row" style={{ marginBottom: 16 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <input
            placeholder="Buscar por nome ou telefone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button onClick={load} style={{ flex: 0 }}>Buscar</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{formatPhone(d.phone)}</td>
                <td>{brl(d.amount)}</td>
                <td>{d.due_date}</td>
                <td><span className={`badge ${d.status}`}>{d.status.replace(/_/g, ' ')}</span></td>
                <td><Link to={`/debtors/${d.id}`}>abrir</Link></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                Nenhum inadimplente encontrado.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
