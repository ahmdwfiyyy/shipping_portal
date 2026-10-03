import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Company design system - change these values to re-brand the whole app.
// ---------------------------------------------------------------------------
const theme = {
  primary: '#0052CC',
  primaryHover: '#003D99',
  secondary: '#172B4D',
  background: '#F4F5F7',
  surface: '#FFFFFF',
  text: '#333333',
  textMuted: '#5E6C84',
  border: '#DFE1E6',
  success: '#36B37E',
  error: '#FF5630',
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
  borderRadius: '8px',
};

// Shared inline styles built from the theme
const styles = {
  page: { minHeight: '100vh', background: theme.background, color: theme.text, fontFamily: theme.fontFamily },
  header: { background: theme.secondary, color: '#fff', padding: '18px 32px', fontSize: '20px', fontWeight: 600 },
  container: { maxWidth: '820px', margin: '0 auto', padding: '24px 16px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px' },
  card: {
    background: theme.surface, border: `1px solid ${theme.border}`,
    borderRadius: theme.borderRadius, padding: '24px', marginBottom: '20px',
  },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: theme.textMuted, marginBottom: '6px' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: '15px',
    border: `1px solid ${theme.border}`, borderRadius: theme.borderRadius, fontFamily: theme.fontFamily,
    background: '#fff', color: theme.text,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '15px' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: `2px solid ${theme.border}`, color: theme.textMuted, fontSize: '13px' },
  td: { padding: '12px', borderBottom: `1px solid ${theme.border}` },
  badge: {
    background: theme.success, color: '#fff', fontSize: '11px', fontWeight: 700,
    padding: '3px 8px', borderRadius: '999px', marginLeft: '8px', whiteSpace: 'nowrap',
  },
};

function Button({ children, variant = 'primary', disabled, ...props }) {
  const [hover, setHover] = useState(false);
  const base = {
    padding: '10px 20px', fontSize: '15px', fontWeight: 600, fontFamily: theme.fontFamily,
    borderRadius: theme.borderRadius, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1, border: 'none',
  };
  const variants = {
    primary: { background: hover && !disabled ? theme.primaryHover : theme.primary, color: '#fff' },
    outline: { background: 'transparent', color: theme.primary, border: `1px solid ${theme.primary}` },
  };
  return (
    <button
      {...props}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
}

function Banner({ type, children }) {
  if (!children) return null;
  const color = type === 'success' ? theme.success : theme.error;
  return (
    <div style={{
      padding: '12px 16px', marginBottom: '16px', borderRadius: theme.borderRadius,
      border: `1px solid ${color}`, background: `${color}1A`, color: theme.text,
    }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Rate Calculator (public)
// ---------------------------------------------------------------------------
function Calculator() {
  const [destinations, setDestinations] = useState([]);
  const [form, setForm] = useState({ destination: '', length: '', width: '', height: '', actual_weight: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/destinations')
      .then((r) => r.json())
      .then((d) => setDestinations(d.destinations || []))
      .catch(() => setError('Could not load destinations. Is the backend running?'));
  }, []);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: form.destination,
          length: parseFloat(form.length),
          width: parseFloat(form.width),
          height: parseFloat(form.height),
          actual_weight: parseFloat(form.actual_weight),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check your inputs');
      setResults(data.results);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const numberField = (key, label, step = '0.1') => (
    <div>
      <label style={styles.label}>{label}</label>
      <input style={styles.input} type="number" min="0" step={step} required value={form[key]} onChange={update(key)} />
    </div>
  );

  return (
    <>
      <form style={styles.card} onSubmit={submit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={styles.label}>Destination Zone</label>
          <select style={styles.input} required value={form.destination} onChange={update('destination')}>
            <option value="">Select destination…</option>
            {destinations.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ ...styles.grid, marginBottom: '20px' }}>
          {numberField('length', 'Length (cm)')}
          {numberField('width', 'Width (cm)')}
          {numberField('height', 'Height (cm)')}
          {numberField('actual_weight', 'Actual Weight (kg)')}
        </div>
        <Button type="submit" disabled={loading}>{loading ? 'Calculating…' : 'Compare Rates'}</Button>
      </form>

      <Banner type="error">{error}</Banner>

      {results && (
        <div style={{ ...styles.card, overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Courier</th>
                <th style={styles.th}>Zone Code</th>
                <th style={styles.th}>Chargeable Weight</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Cost (RM)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.courier} style={r.is_cheapest ? { background: `${theme.success}14` } : undefined}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>
                    {r.courier}
                    {r.is_cheapest && <span style={styles.badge}>Best Rate</span>}
                  </td>
                  <td style={styles.td}>{r.zone_code}</td>
                  <td style={styles.td}>{r.chargeable_weight.toFixed(2)} kg</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{r.total_cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Admin Rate Upload (protected)
// ---------------------------------------------------------------------------
function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setFile(null);
    setMessage({ type: '', text: '' });
  };

  const login = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return setMessage({ type: 'error', text: 'Please choose an Excel file first.' });
    setMessage({ type: '', text: '' });
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload-rates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (res.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setMessage({ type: 'success', text: data.message });
      setFile(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <form style={{ ...styles.card, maxWidth: '380px' }} onSubmit={login}>
        <h3 style={{ marginTop: 0, color: theme.secondary }}>Admin Login</h3>
        <Banner type="error">{message.text}</Banner>
        <label style={styles.label}>Password</label>
        <input
          style={{ ...styles.input, marginBottom: '16px' }}
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</Button>
      </form>
    );
  }

  return (
    <form style={styles.card} onSubmit={upload}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: theme.secondary }}>Upload Rate Card</h3>
        <Button type="button" variant="outline" onClick={logout}>Logout</Button>
      </div>
      <Banner type={message.type}>{message.text}</Banner>
      <p style={{ color: theme.textMuted, marginTop: 0 }}>
        The workbook must contain the sheets <b>Zone_Mapping</b> and <b>Rates</b>. Uploading replaces the current rates.
      </p>
      <input
        style={{ ...styles.input, marginBottom: '16px' }}
        type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)}
      />
      <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload New Excel Card'}</Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// App shell with navigation tabs
// ---------------------------------------------------------------------------
export default function App() {
  const [tab, setTab] = useState('calculator');

  const tabButton = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '10px 18px', fontSize: '15px', fontWeight: 600, fontFamily: theme.fontFamily,
        cursor: 'pointer', borderRadius: theme.borderRadius,
        border: `1px solid ${tab === id ? theme.primary : theme.border}`,
        background: tab === id ? theme.primary : theme.surface,
        color: tab === id ? '#fff' : theme.text,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>📦 Shipping Rate Portal</div>
      <div style={styles.container}>
        <div style={styles.tabs}>
          {tabButton('calculator', 'Rate Calculator')}
          {tabButton('admin', 'Admin Rate Upload')}
        </div>
        {tab === 'calculator' ? <Calculator /> : <Admin />}
      </div>
    </div>
  );
}
