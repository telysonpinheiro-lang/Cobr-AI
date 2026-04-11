import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_LABEL = {
  nao_contatado: 'Não contatado',
  em_conversa: 'Em conversa',
  negociando: 'Negociando',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  ignorado: 'Ignorado',
};

function brl(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try { setData(await api.dashboard()); }
    catch (err) { setError(err.message); }
  }

  async function runRegua() {
    try {
      const r = await api.runScheduler();
      alert(`Régua executada. Mensagens enviadas: ${r.totalSent}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Carregando...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Dashboard</h2>
        <button className="secondary" onClick={runRegua}>Rodar régua agora</button>
      </div>

      <div className="cards">
        <div className="card warning">
          <div className="label">Total em aberto</div>
          <div className="value">{brl(data.open_amount)}</div>
        </div>
        <div className="card success">
          <div className="label">Total recuperado</div>
          <div className="value">{brl(data.recovered_amount)}</div>
        </div>
        <div className="card">
          <div className="label">Taxa de conversão</div>
          <div className="value">{data.conversion_rate}%</div>
        </div>
        <div className="card">
          <div className="label">Total de inadimplentes</div>
          <div className="value">{data.total_debtors}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Por status</h3>
        <table>
          <thead>
            <tr><th>Status</th><th>Quantidade</th><th>Valor</th></tr>
          </thead>
          <tbody>
            {data.by_status.map((s) => (
              <tr key={s.status}>
                <td><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span></td>
                <td>{s.count}</td>
                <td>{brl(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <p style={{ color: 'var(--muted)' }}>
          Próximos passos: <Link to="/upload">importe sua planilha</Link> ou
          {' '}<Link to="/debtors">veja os inadimplentes</Link>.
        </p>
      </div>
    </div>
  );
}
