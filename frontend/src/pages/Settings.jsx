import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.getSettings().then(setS); }, []);

  function update(k, v) { setS({ ...s, [k]: v }); }

  async function save() {
    await api.saveSettings(s);
    setMsg('Configurações salvas');
    setTimeout(() => setMsg(''), 2000);
  }

  if (!s) return <p>Carregando...</p>;

  return (
    <div>
      <h2>Configurações</h2>

      <div className="panel">
        <h3>Tom de linguagem da IA</h3>
        <select value={s.tone} onChange={(e) => update('tone', e.target.value)}>
          <option value="formal">Formal</option>
          <option value="amigavel">Amigável</option>
          <option value="firme">Firme</option>
        </select>
      </div>

      <div className="panel">
        <h3>Regras de negociação</h3>
        <div className="row">
          <div className="field">
            <label>Desconto máximo (%)</label>
            <input type="number" value={s.max_discount}
              onChange={(e) => update('max_discount', e.target.value)} />
          </div>
          <div className="field">
            <label>Parcelas máximas</label>
            <input type="number" value={s.max_installments}
              onChange={(e) => update('max_installments', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Régua de cobrança (dias após o vencimento)</h3>
        <div className="row">
          <div className="field">
            <label>1ª mensagem (D+)</label>
            <input type="number" value={s.dunning_d1}
              onChange={(e) => update('dunning_d1', e.target.value)} />
          </div>
          <div className="field">
            <label>Follow-up (D+)</label>
            <input type="number" value={s.dunning_d2}
              onChange={(e) => update('dunning_d2', e.target.value)} />
          </div>
          <div className="field">
            <label>Oferta de desconto (D+)</label>
            <input type="number" value={s.dunning_d3}
              onChange={(e) => update('dunning_d3', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Janela de envio</h3>
        <div className="row">
          <div className="field">
            <label>Início</label>
            <input type="time" value={s.send_window_start}
              onChange={(e) => update('send_window_start', e.target.value)} />
          </div>
          <div className="field">
            <label>Fim</label>
            <input type="time" value={s.send_window_end}
              onChange={(e) => update('send_window_end', e.target.value)} />
          </div>
        </div>
      </div>

      <button onClick={save}>Salvar configurações</button>
      {msg && <div className="success" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
