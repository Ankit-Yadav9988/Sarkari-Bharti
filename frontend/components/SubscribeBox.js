import { useState } from 'react';
import { API_URL } from '../lib/api';
import { useLang } from '../lib/i18n';

// "Get job alerts" box. POSTs to the public /api/subscribers endpoint; the
// admin mails the list from /admin/subscribers.
export default function SubscribeBox() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch(`${API_URL}/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="panel" style={{ borderColor: '#b6dfc4' }}>
        <div style={{ background: '#e3f4e8', color: '#14713d', padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>
          ✅ {t('subscribe.done')}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ background: 'var(--maroon)' }}>
        📬 {t('subscribe.title')}
      </div>
      <div style={{ padding: 12, textAlign: 'center' }}>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 10 }}>{t('subscribe.sub')}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="email"
            required
            style={{ marginTop: 0, maxWidth: 320 }}
            placeholder={t('subscribe.placeholder')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-label={t('subscribe.placeholder')}
          />
          <button type="submit" className="btn-primary" disabled={state === 'sending'}>
            {state === 'sending' ? '…' : t('subscribe.button')}
          </button>
        </form>
        {state === 'error' && (
          <p className="small" style={{ color: '#a11019', marginBottom: 0, marginTop: 8 }}>
            {t('subscribe.error')}
          </p>
        )}
      </div>
    </div>
  );
}
