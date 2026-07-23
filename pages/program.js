
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

// 오늘 기준 weekOffset주 전의 7일 목록. weekOffset=0이면 오늘 포함 최근 7일.
function weekDates(weekOffset = 0, days = 7) {
  const arr = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i - weekOffset * days);
    arr.push(d);
  }
  return arr;
}

export default function Program() {
  const router = useRouter();
  const routerReady = router.isReady;

  const [date, setDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const topSlot = useAdSlot('home_top');
  const bottomSlot = useAdSlot('home_bottom');
  const leftSlot = useAdSlot('home_left');
  const rightSlot = useAdSlot('home_right');

  // 관리자 로그인 여부(admin.js에서 로그인 성공 시 sessionStorage.tvdb_admin='1'로 저장함)
  useEffect(() => {
    setIsAdmin(sessionStorage.getItem('tvdb_admin') === '1');
  }, []);

  // URL 쿼리스트링 -> 상태로 최초 1회 복원 (새로고침해도 유지됨)
  useEffect(() => {
    if (!routerReady) return;
    const q = router.query;
    if (q.date) setDate(q.date);
    if (q.channel) setChannelFilter(q.channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerReady]);

  // 상태 -> URL 쿼리스트링으로 동기화 (뒤로가기/새로고침 대비, 히스토리는 안 쌓음)
  useEffect(() => {
    if (!routerReady) return;
    const query = { date };
    if (channelFilter) query.channel = channelFilter;
    router.replace({ pathname: '/program', query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerReady, date, channelFilter]);

  useEffect(() => {
    if (!routerReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('tvdb_program')
        .select('*')
        .eq('broadcast_date', date)
        .order('time_start', { ascending: true })
        .limit(1000);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [routerReady, date]);

  // 관리자 체크박스 토글: DB 업데이트 + 화면 즉시 반영
  async function toggleTarget(row) {
    const next = !row.is_life_health_target;
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, is_life_health_target: next } : r));
    const { error } = await supabase
      .from('tvdb_program')
      .update({ is_life_health_target: next })
      .eq('id', row.id);
    if (error) {
      // 실패하면 원상복구
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, is_life_health_target: !next } : r));
      alert('저장 실패: ' + error.message);
    }
  }

  function pickDate(ds) {
    setDate(ds);
  }

  function goPrevWeek() {
    const next = weekOffset + 1;
    setWeekOffset(next);
    setDate(toDateStr(weekDates(next)[0])); // 이동한 주의 첫 날짜로 이동
  }

  function goNextWeek() {
    const next = Math.max(0, weekOffset - 1);
    setWeekOffset(next);
    setDate(toDateStr(weekDates(next)[next === 0 ? 6 : 0]));
  }

  const dateList = weekDates(weekOffset);

  const channels = Array.from(new Set(rows.map(r => r.channel))).sort();

  const filtered = rows.filter(r => (!channelFilter || r.channel === channelFilter));

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, maxWidth: 1440, margin: '0 auto', padding: '24px 16px' }}>
      <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
        <AdSlot slot="home_left" label="광고" slotData={leftSlot} />
      </div>

      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, width: '100%', color: '#222' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>TVDB</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>홈쇼핑·방송 편성 데이터 아카이브</p>

      <Nav />

      <div style={{ marginBottom: 20 }}>
        <AdSlot slot="home_top" label="광고" slotData={topSlot} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <button onClick={goPrevWeek} title="이전 7일" style={{
          flexShrink: 0, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
          background: '#fff', color: '#222', cursor: 'pointer',
        }}>◀</button>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
          {dateList.map(d => {
            const ds = toDateStr(d);
            const active = ds === date;
            return (
              <button
                key={ds}
                onClick={() => pickDate(ds)}
                style={{
                  flex: '1 0 64px', padding: '8px 6px', border: '1px solid #ccc', borderRadius: 6,
                  background: active ? '#222' : '#fff', color: active ? '#fff' : '#222',
                  cursor: 'pointer', textAlign: 'center', lineHeight: 1.4,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.getMonth() + 1}.{d.getDate()}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>{WEEKDAY_KR[d.getDay()]}</div>
              </button>
            );
          })}
        </div>
        <button onClick={goNextWeek} disabled={weekOffset === 0} title="다음 7일" style={{
          flexShrink: 0, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
          background: '#fff', color: weekOffset === 0 ? '#ccc' : '#222',
          cursor: weekOffset === 0 ? 'default' : 'pointer',
        }}>▶</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
          <option value="">전체 채널</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length}건</span>
        {isAdmin && (
          <span style={{ fontSize: 12, color: '#b45309', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '3px 8px' }}>
            🔓 관리자 모드 — 체크박스로 색칠 직접 지정 가능
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', marginLeft: 'auto' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fff3cd', border: '1px solid #f0d68a', display: 'inline-block' }} />
          생활·건강 (어르신 시청 위주)
        </span>
      </div>

      {loading && <p>불러오는 중...</p>}
      {error && <p style={{ color: 'crimson' }}>에러: {error}</p>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #222' }}>
              {isAdmin && <th style={{ padding: '8px 6px', width: 30 }}></th>}
              <th style={{ padding: '8px 6px' }}>시간</th>
              <th style={{ padding: '8px 6px' }}>채널</th>
              <th style={{ padding: '8px 6px' }}>프로그램명</th>
              <th style={{ padding: '8px 6px' }}>장르</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee', background: r.is_life_health_target ? '#fff3cd' : undefined }}>
                {isAdmin && (
                  <td style={{ padding: '6px' }}>
                    <input type="checkbox" checked={!!r.is_life_health_target} onChange={() => toggleTarget(r)} style={{ cursor: 'pointer' }} />
                  </td>
                )}
                <td style={{ padding: '6px' }}>{r.time_start}</td>
                <td style={{ padding: '6px' }}>{r.channel}</td>
                <td style={{ padding: '6px' }}>{r.program_name}</td>
                <td style={{ padding: '6px' }}>{r.genre}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: 16, color: '#888' }}>이 날짜엔 데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 24 }}>
        <AdSlot slot="home_bottom" label="광고" slotData={bottomSlot} />
      </div>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 13 }}>
        <a href="/admin" style={{ color: '#888', textDecoration: 'none' }}>admin</a>
      </div>
      </div>

      <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
        <AdSlot slot="home_right" label="광고" slotData={rightSlot} />
      </div>

      <style jsx>{`
        @media (max-width: 1279px) {
          .tvdb-sidebar { display: none; }
        }
      `}</style>
    </div>
  );
}
