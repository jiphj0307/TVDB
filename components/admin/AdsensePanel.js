import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';
import { SLOT_BANNER_SIZE, DEFAULT_AD_SLOTS } from '../../lib/adSlotSizes';

const SOURCE_OPTIONS = [
  { value: 'adsense', label: '애드센스' },
  { value: 'coupang', label: '쿠팡' },
  { value: 'random', label: '무작위' },
];

// 프레시시즌 AdsensePanel.js를 TVDB용(직접 Supabase 호출)으로 이식 — 슬롯 개념·동작 방식 동일

export default function AdsensePanel({ showToast }) {
  const [adSlots, setAdSlots] = useState([]);
  const [editId, setEditId] = useState(null);
  const [code, setCode] = useState('');
  const [pendingActive, setPendingActive] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [coupangWidgets, setCoupangWidgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: settingsRow } = await supabase.from('tvdb_settings').select('value').eq('key', 'ad_slots').maybeSingle();
      let list = [];
      try { list = settingsRow?.value ? JSON.parse(settingsRow.value) : []; } catch { list = []; }
      setAdSlots(list.length ? list : DEFAULT_AD_SLOTS);

      const { data: widgets } = await supabase.from('tvdb_coupang_widgets').select('*');
      setCoupangWidgets(widgets || []);
      setLoading(false);
    }
    load();
  }, []);

  const countCoupangBanners = (slotId) => {
    const size = SLOT_BANNER_SIZE[slotId];
    if (!size) return 0;
    return coupangWidgets.filter(w => w.enabled && w.widget_html && w.size === size).length;
  };

  const persist = async (nextSlots) => {
    await supabase.from('tvdb_settings').upsert({ key: 'ad_slots', value: JSON.stringify(nextSlots) });
    showToast?.('✅ 저장 완료');
  };

  const updateSlot = (id, patch) => {
    const next = adSlots.map(s => s.id === id ? { ...s, ...patch } : s);
    setAdSlots(next);
    return next;
  };

  const saveCode = async (id) => {
    setSavingId(id);
    const next = updateSlot(id, { code });
    await persist(next);
    setEditId(null);
    setSavingId(null);
  };

  const removeCode = async (id) => {
    setSavingId(id);
    const next = updateSlot(id, { code: '' });
    await persist(next);
    setEditId(null);
    setSavingId(null);
  };

  const saveActive = async (id) => {
    setSavingId(id);
    const val = pendingActive[id];
    const next = updateSlot(id, { active: val });
    await persist(next);
    setPendingActive(p => { const n = { ...p }; delete n[id]; return n; });
    setSavingId(null);
  };

  const setSource = async (id, source) => {
    setSavingId(id);
    const next = updateSlot(id, { source });
    await persist(next);
    setSavingId(null);
  };

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>📢 광고 슬롯 관리</div>
        <div style={{ marginBottom: 20, padding: 16, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
          <strong>동작 방식</strong><br />
          ⚪ <strong>OFF</strong> — 화면에서 해당 광고 영역이 완전히 숨겨집니다.<br />
          🟡 <strong>대기</strong> — ON인데 노출할 코드/배너가 없는 상태.<br />
          ✅ <strong>ON + 코드/배너 등록</strong> — 실제 광고가 노출됩니다.<br /><br />
          <strong>애드센스</strong> — 코드 입력에 등록한 코드 노출 / <strong>쿠팡</strong> — 쿠팡 관리에서 이 슬롯 사이즈와 맞는 배너 자동 노출 / <strong>무작위</strong> — 둘 중 있는 것 무작위 노출
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {adSlots.map(slot => {
            const isPending = slot.id in pendingActive;
            const activeVal = isPending ? pendingActive[slot.id] : slot.active;
            const isSaving = savingId === slot.id;
            const source = slot.source || 'adsense';
            const coupangCount = countCoupangBanners(slot.id);
            const hasContent = source === 'coupang' ? coupangCount > 0
              : source === 'random' ? (!!slot.code || coupangCount > 0)
              : !!slot.code;
            let statusText = '⚪ OFF (숨김)';
            if (activeVal) {
              if (!hasContent) statusText = '🟡 대기 (코드/배너 등록 필요)';
              else if (source === 'coupang') statusText = `🛒 쿠팡 배너 자동 노출 (${coupangCount}개 등록됨)`;
              else if (source === 'random') statusText = '🔀 무작위 노출 중';
              else statusText = '✅ 광고 노출 중';
            }
            return (
              <div key={slot.id} style={S.row}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1f0f' }}>{slot.name}</span>
                      <span style={{ fontSize: 11, color: '#4b6e4b', background: '#e8f5e9', padding: '2px 8px', borderRadius: 6 }}>{slot.w} × {slot.h}px</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#4b6e4b', marginBottom: 10 }}>슬롯 ID: {slot.id}</div>

                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, maxWidth: slot.w }}>
                      {SOURCE_OPTIONS.map(opt => {
                        const on = source === opt.value;
                        return (
                          <button key={opt.value} onClick={() => setSource(slot.id, opt.value)} disabled={isSaving}
                            style={{ flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit', sans-serif", border: `1.5px solid ${on ? '#16a34a' : '#e5e7eb'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#16a34a' : '#6b7280', opacity: isSaving ? 0.6 : 1 }}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ maxWidth: slot.w, height: 50, background: activeVal && hasContent ? '#f0fdf4' : activeVal ? '#fffbeb' : '#f5f5f5', border: `1.5px dashed ${activeVal && hasContent ? '#22c55e' : activeVal ? '#fbbf24' : '#d1d5db'}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: activeVal && hasContent ? '#16a34a' : activeVal ? '#92400e' : '#9ca3af', marginBottom: 10, textAlign: 'center', padding: '0 8px' }}>
                      {statusText}
                    </div>

                    {source !== 'coupang' ? (
                      editId === slot.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <textarea value={code} onChange={e => setCode(e.target.value)} rows={4} placeholder="<script>... AdSense 코드를 붙여넣으세요 ...</script>" style={S.textarea} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => saveCode(slot.id)} disabled={isSaving} style={{ ...S.btn(), padding: '7px 16px', fontSize: 13, opacity: isSaving ? 0.6 : 1 }}>저장</button>
                            <button onClick={() => setEditId(null)} style={{ ...S.btnGhost, padding: '7px 16px', fontSize: 13 }}>취소</button>
                            {slot.code && <button onClick={() => removeCode(slot.id)} style={{ ...S.btn('#166534'), padding: '7px 16px', fontSize: 13 }}>코드 삭제</button>}
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setCode(slot.code || ''); setEditId(slot.id); }} style={{ ...S.btnGhost, padding: '7px 16px', fontSize: 13 }}>
                          {slot.code ? '코드 편집' : '+ 코드 입력'}
                        </button>
                      )
                    ) : (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>쿠팡 관리에서 이 슬롯 사이즈에 맞는 배너를 등록하면 자동으로 노출돼요.</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div onClick={() => setPendingActive(p => ({ ...p, [slot.id]: !activeVal }))} style={{ width: 46, height: 26, borderRadius: 13, background: activeVal ? '#22c55e' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 3, left: activeVal ? 23 : 3, transition: 'left .2s' }} />
                    </div>
                    <span style={{ fontSize: 11, color: activeVal && hasContent ? '#16a34a' : activeVal ? '#92400e' : '#6b7280', fontWeight: 600 }}>
                      {activeVal && hasContent ? 'ON' : activeVal ? '대기' : 'OFF'}
                    </span>
                    {isPending && (
                      <button onClick={() => saveActive(slot.id)} disabled={isSaving} style={{ ...S.btn(), padding: '5px 12px', fontSize: 12, opacity: isSaving ? 0.6 : 1 }}>저장</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
