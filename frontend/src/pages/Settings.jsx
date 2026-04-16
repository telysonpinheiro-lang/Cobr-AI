import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PROVIDERS = [
  { value: 'mock',      label: 'Mock (sem envio real)' },
  { value: 'evolution', label: 'Evolution API' },
  { value: 'zapi',      label: 'Z-API' },
];

export default function Settings() {
  const [s, setS]           = useState(null);
  const [msg, setMsg]       = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.getSettings().then(setS); }, []);

  function update(k, v) { setS({ ...s, [k]: v }); }

  async function save() {
    await api.saveSettings(s);
    setMsg('Configurações salvas');
    setTimeout(() => setMsg(''), 2500);
  }

  async function testEvolution() {
    setTesting(true);
    setTestMsg('');
    try {
      await api.testEvolution({
        evolution_base_url:  s.evolution_base_url,
        evolution_api_key:   s.evolution_api_key,
        evolution_instance:  s.evolution_instance,
      });
      setTestMsg('✓ Conexão OK — instância conectada!');
    } catch (err) {
      setTestMsg('✗ ' + err.message);
    } finally {
      setTesting(false);
    }
  }

  if (!s) return <p>Carregando...</p>;

  const isEvolution = s.whatsapp_provider === 'evolution';

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

      {/* ── Integração WhatsApp ─────────────────────────────────── */}
      <div className="panel">
        <h3>Integração WhatsApp</h3>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Provedor</label>
          <select
            value={s.whatsapp_provider || 'mock'}
            onChange={(e) => update('whatsapp_provider', e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {isEvolution && (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>URL base da Evolution API</label>
              <input
                type="url"
                placeholder="http://SEU-IP:8080"
                value={s.evolution_base_url || ''}
                onChange={(e) => update('evolution_base_url', e.target.value)}
              />
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label>API Key</label>
              <input
                type="password"
                placeholder="sua-api-key"
                value={s.evolution_api_key || ''}
                onChange={(e) => update('evolution_api_key', e.target.value)}
              />
            </div>

            <div className="field" style={{ marginBottom: 16 }}>
              <label>Nome da instância</label>
              <input
                type="text"
                placeholder="minha-instancia"
                value={s.evolution_instance || ''}
                onChange={(e) => update('evolution_instance', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={testEvolution}
                disabled={testing}
                style={{ background: '#2563eb' }}
              >
                {testing ? 'Testando...' : 'Testar conexão'}
              </button>
              {testMsg && (
                <span style={{
                  color: testMsg.startsWith('✓') ? '#16a34a' : '#dc2626',
                  fontWeight: 500,
                }}>
                  {testMsg}
                </span>
              )}
            </div>

            <p style={{ marginTop: 14, fontSize: 13, color: '#6b7280' }}>
              Configure o webhook da instância para:<br />
              <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                POST {window.location.origin}/api/webhook/whatsapp
              </code>
              <br />Evento: <strong>messages.upsert</strong>
            </p>
          </>
        )}
      </div>

      <button onClick={save}>Salvar configurações</button>
      {msg && <div className="success" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
