// TVDB 관리자 공용 스타일 & UI 컴포넌트 (프레시시즌 AdminUI.js 그대로 이식)
export const S = {
  card: { background: '#ffffff', border: '1px solid #d1e8d1', borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(22,163,74,0.06)' },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: '#0f1f0f' },
  input: {
    background: '#f5f9f5', border: '1px solid #d1e8d1', borderRadius: 8,
    padding: '10px 14px', color: '#0f1f0f', fontFamily: "'Outfit', sans-serif",
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  textarea: {
    background: '#f5f9f5', border: '1px solid #d1e8d1', borderRadius: 8,
    padding: '10px 14px', color: '#0f1f0f', fontFamily: 'monospace',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
    resize: 'vertical', lineHeight: 1.7,
  },
  btn: (color = '#16a34a') => ({
    background: color, color: '#fff', border: 'none', borderRadius: 9,
    padding: '10px 22px', fontFamily: "'Outfit', sans-serif",
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  }),
  btnGhost: {
    background: 'none', color: '#4b6e4b', border: '1px solid #d1e8d1', borderRadius: 9,
    padding: '10px 22px', fontFamily: "'Outfit', sans-serif",
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  label: { color: '#4b6e4b', fontSize: 12, marginBottom: 5, display: 'block', fontWeight: 600 },
  row: { background: '#f5f9f5', border: '1px solid #d1e8d1', borderRadius: 10, padding: '12px 16px', marginBottom: 8 },
}

export function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 50, height: 28, borderRadius: 14,
      background: value ? '#16a34a' : '#d1e8d1',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11, background: '#fff',
        position: 'absolute', top: 3, left: value ? 25 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
      }} />
    </div>
  )
}

export function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#fff', border: '1px solid #d1e8d1', borderRadius: 10,
      padding: '12px 22px', fontSize: 14, color: '#0f1f0f', zIndex: 999,
      boxShadow: '0 8px 24px rgba(22,163,74,0.15)',
    }}>{msg}</div>
  )
}
