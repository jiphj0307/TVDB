
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// 관리자 페이지에 들어올 때마다 홈쇼핑(tvdb_shopping)·일반방송(tvdb_program) 양쪽을 훑어서
// "이번 주 일요일"까지 못 채운 채널이 있으면 모달로 바로 띄운다 — 탭을 하나하나 열어봐야
// 알 수 있던 걸 접속하자마자 알 수 있게 하기 위함. 같은 날 안에서는 한 번 닫으면 다시
// 안 뜨도록 sessionStorage에 날짜를 찍어두고(다음날 다시 접속하면 재평가), "채널별 메모"로
// 바로 이동할 수 있는 버튼도 같이 준다.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function thisSundayStr() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return toDateStr(d);
}
function daysBehind(dateStr, target) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(target + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

async function loadBehindList(table) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('channel, broadcast_date').range(from, from + PAGE - 1);
    if (error) break;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  const byChannel = {};
  for (const r of all) {
    byChannel[r.channel] ??= r.broadcast_date;
    if (r.broadcast_date > byChannel[r.channel]) byChannel[r.channel] = r.broadcast_date;
  }
  const sunday = thisSundayStr();
  return Object.entries(byChannel)
    .map(([channel, max]) => ({ channel, max, behind: daysBehind(max, sunday) }))
    .filter(x => x.behind > 0)
    .sort((a, b) => b.behind - a.behind);
}

const DISMISS_KEY = 'tvdb_update_popup_dismissed_date';

export default function UpdateNeededPopup({ onNavigate }) {
  const [shoppingBehind, setShoppingBehind] = useState([]);
  const [broadcastBehind, setBroadcastBehind] = useState([]);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [shop, bc] = await Promise.all([
        loadBehindList('tvdb_shopping'),
        loadBehindList('tvdb_program'),
      ]);
      setShoppingBehind(shop);
      setBroadcastBehind(bc);
      setLoaded(true);
      const today = toDateStr(new Date());
      const dismissedDate = typeof window !== 'undefined' ? sessionStorage.getItem(DISMISS_KEY) : null;
      if ((shop.length > 0 || bc.length > 0) && dismissedDate !== today) {
        setVisible(true);
      }
    })();
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, toDateStr(new Date()));
    setVisible(false);
  }

  if (!loaded || !visible) return null;

  const total = shoppingBehind.length + broadcastBehind.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,31,15,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', border: '1px solid #d1e8d1', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(15,31,15,0.25)', fontFamily: "'Outfit', sans-serif",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1f0f', marginBottom: 6 }}>
          ⏰ 일정 업데이트가 필요합니다
        </div>
        <p style={{ fontSize: 13, color: '#4b6e4b', marginTop: 0, marginBottom: 18 }}>
          이번 주 일요일까지 못 채운 채널 {total}개가 있습니다.
        </p>

        {shoppingBehind.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1f0f', marginBottom: 8 }}>🛍️ 홈쇼핑 ({shoppingBehind.length}개)</div>
            {shoppingBehind.map(x => (
              <div key={x.channel} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#f5f9f5', border: '1px solid #d1e8d1', borderRadius: 8,
                padding: '8px 12px', marginBottom: 6, fontSize: 13,
              }}>
                <span>{x.channel} <span style={{ color: '#8aaa8a' }}>(마지막 {x.max})</span></span>
                <span style={{ fontWeight: 700, color: x.behind >= 2 ? '#dc2626' : '#d97706' }}>{x.behind}일 뒤처짐</span>
              </div>
            ))}
          </div>
        )}

        {broadcastBehind.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1f0f', marginBottom: 8 }}>📺 일반방송 ({broadcastBehind.length}개)</div>
            {broadcastBehind.map(x => (
              <div key={x.channel} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#f5f9f5', border: '1px solid #d1e8d1', borderRadius: 8,
                padding: '8px 12px', marginBottom: 6, fontSize: 13,
              }}>
                <span>{x.channel} <span style={{ color: '#8aaa8a' }}>(마지막 {x.max})</span></span>
                <span style={{ fontWeight: 700, color: x.behind >= 2 ? '#dc2626' : '#d97706' }}>{x.behind}일 뒤처짐</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={() => { dismiss(); onNavigate?.(shoppingBehind.length > 0 ? 'shopping' : 'broadcast'); }} style={{
            background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9,
            padding: '10px 18px', fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: 1,
          }}>채널별 메모로 이동</button>
          <button type="button" onClick={dismiss} style={{
            background: 'none', color: '#4b6e4b', border: '1px solid #d1e8d1', borderRadius: 9,
            padding: '10px 18px', fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>오늘은 닫기</button>
        </div>
      </div>
    </div>
  );
}
