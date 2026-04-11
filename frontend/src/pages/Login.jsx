import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';

export default function Login() {
  const [email, setEmail] = useState('demo@cobrai.com');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email, password);
      setSession(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h1 style={{ marginBottom: 2 }}>Cobr-AI</h1>
        <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>
          by VIRTUAL CORE
        </p>
        <p style={{ marginTop: 12 }}>Recuperação automática de inadimplência</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
