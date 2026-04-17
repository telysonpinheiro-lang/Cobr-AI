import { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

const PROVIDERS = [
  { value: 'mock',      label: 'Mock (sem envio real)' },
  { value: 'evolution', label: 'Evolution API' },
  { value: 'zapi',      label: 'Z-API' },
];

const PIX_TYPES = [
  { value: 'cpf',       label: 'CPF',              placeholder: '000.000.000-00' },
  { value: 'cnpj',      label: 'CNPJ',             placeholder: '00.000.000/0001-00' },
  { value: 'email',     label: 'E-mail',           placeholder: 'seuemail@exemplo.com' },
  { value: 'telefone',  label: 'Telefone',         placeholder: '(11) 99999-9999' },
  { value: 'aleatoria', label: 'Chave aleatória',  placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
];

export default function Settings() {
  const [s, setS]                   = useState(null);
  const [msg, setMsg]               = useState('');
  const [testMsg, setTestMsg]       = useState('');
  const [testing, setTesting]       = useState(false);
  const [qrData, setQrData]         = useState(null);
  const [qrLoading, setQrLoading]   = useState(false);
  const [schedulerRuns, setSchedulerRuns] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    api.getSettings().then(setS);
    api.schedulerStatus().then((d) => setSchedulerRuns(d.runs || [])).catch(() => {});
  }, []);
  useEffect(() => () => clearInterval(pollRef.current), []);

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

  async function loadQR() {
    setQrLoading(true);
    setQrData(null);
    clearInterval(pollRef.current);
    try {
      const data = await api.evolutionQR(s.evolution_instance);
      setQrData(data);
      if (!data.connected) {
        // Policia a cada 3s até conectar
        pollRef.current = setInterval(async () => {
          try {
            const d = await api.evolutionQR(s.evolution_instance);
            setQrData(d);
            if (d.connected) clearInterval(pollRef.current);
          } catch { clearInterval(pollRef.current); }
        }, 3000);
      }
    } catch (err) {
      setQrData({ error: err.message });
    } finally {
      setQrLoading(false);
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
              <button
                onClick={loadQR}
                disabled={qrLoading}
                className="secondary"
              >
                {qrLoading ? 'Buscando...' : 'QR Code / Conectar WhatsApp'}
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

            {/* ── QR Code ─────────────────────────────────────────── */}
            {qrData && (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                {qrData.error && (
                  <p style={{ color: '#dc2626' }}>Erro: {qrData.error}</p>
                )}
                {qrData.connected && (
                  <p style={{ color: '#16a34a', fontWeight: 600 }}>
                    ✓ WhatsApp conectado! Número: {qrData.number}
                  </p>
                )}
                {!qrData.connected && !qrData.error && qrData.base64 && (
                  <>
                    <p style={{ fontWeight: 600, marginBottom: 8 }}>
                      Escaneie com o WhatsApp do celular:
                    </p>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                      WhatsApp → Dispositivos conectados → Conectar dispositivo → escanear QR
                    </p>
                    <img
                      src={qrData.base64}
                      alt="QR Code WhatsApp"
                      style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }}
                    />
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                      Aguardando escaneamento... (atualiza automaticamente)
                    </p>
                  </>
                )}
                {!qrData.connected && !qrData.error && !qrData.base64 && (
                  <p style={{ color: '#d97706' }}>
                    QR ainda sendo gerado — aguarde alguns segundos e tente novamente.
                  </p>
                )}
              </div>
            )}

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

      {/* ── Chave PIX ───────────────────────────────────────── */}
      <div className="panel">
        <h3>Chave PIX para recebimento</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          Usada para gerar os links de pagamento enviados aos devedores.
        </p>
        <div className="row">
          <div className="field" style={{ maxWidth: 180 }}>
            <label>Tipo de chave</label>
            <select
              value={s.pix_key_type || ''}
              onChange={(e) => update('pix_key_type', e.target.value)}
            >
              <option value="">Selecione...</option>
              {PIX_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Chave PIX</label>
            <input
              type="text"
              value={s.pix_key || ''}
              placeholder={
                PIX_TYPES.find((t) => t.value === s.pix_key_type)?.placeholder || 'Digite a chave'
              }
              onChange={(e) => update('pix_key', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Status do Scheduler ─────────────────────────────── */}
      <div className="panel">
        <h3>Régua de cobrança — últimas execuções</h3>
        {schedulerRuns.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma execução registrada ainda.</p>
        ) : (
          <table style={{ fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Quando</th>
                <th style={{ textAlign: 'center' }}>Enviadas</th>
                <th style={{ textAlign: 'center' }}>Erros</th>
                <th style={{ textAlign: 'right' }}>Duração</th>
              </tr>
            </thead>
            <tbody>
              {schedulerRuns.map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.ran_at).toLocaleString('pt-BR')}</td>
                  <td style={{ textAlign: 'center', color: r.total_sent > 0 ? '#16a34a' : 'inherit' }}>
                    {r.total_sent}
                  </td>
                  <td style={{ textAlign: 'center', color: r.total_errors > 0 ? '#dc2626' : 'inherit' }}>
                    {r.total_errors}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.duration_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button onClick={save}>Salvar configurações</button>
      {msg && <div className="success" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
