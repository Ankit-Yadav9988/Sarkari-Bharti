// WhatsApp / Telegram / copy-link share row, used on the job detail page.
// In India WhatsApp sharing IS the distribution channel - keep it first
// and make the tap targets big.

import { useState } from 'react';
import { useLang } from '../lib/i18n';

export default function ShareButtons({ title, url }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const text = `${title}\n${url}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers: fallback via a hidden input
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="small muted" style={{ marginBottom: 6 }}>{t('job.share')}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="share-btn" style={{ background: '#25D366' }}>
          <WhatsAppIcon /> WhatsApp
        </a>
        <a href={tg} target="_blank" rel="noopener noreferrer" className="share-btn" style={{ background: '#229ED9' }}>
          <TelegramIcon /> Telegram
        </a>
        <button onClick={copyLink} className="share-btn" style={{ background: '#5B6770', cursor: 'pointer' }}>
          🔗 {copied ? t('share.copied') : t('share.copy')}
        </button>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.83 9.83 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 0 1 7 2.9 9.83 9.83 0 0 1 2.9 7c0 5.45-4.45 9.87-9.91 9.87zm8.43-18.29A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.94L.06 24l6.32-1.66a11.9 11.9 0 0 0 5.67 1.44h.01c6.55 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.47-8.39z"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.94 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.06zm4.97 7.15c.18 0 .58.04.84.25.17.14.22.33.25.47.02.1.05.34.02.52-.25 2.68-1.35 9.16-1.9 12.15-.24 1.27-.7 1.7-1.15 1.74-.98.09-1.72-.65-2.66-1.27-1.48-.97-2.32-1.57-3.75-2.52-1.66-1.1-.58-1.7.36-2.68.25-.26 4.52-4.14 4.6-4.5.01-.04.02-.2-.08-.3-.1-.09-.24-.06-.35-.03-.14.03-2.5 1.59-7.05 4.66-.67.46-1.27.68-1.81.67-.6-.01-1.75-.34-2.6-.61-1.05-.34-1.88-.52-1.8-1.1.03-.3.44-.61 1.22-.93 4.78-2.08 7.96-3.46 9.56-4.12 4.55-1.9 5.5-2.23 6.12-2.24z"/>
    </svg>
  );
}
