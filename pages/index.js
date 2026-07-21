import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const router = useRouter();
  const routerReady = router.isReady;

  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState('shopping'); // 'shopping' | 'program'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const topSlot = useAdSlot('home_top');
  const bottomSlot = useAdSlot('home_bottom');

  // URL 쿼리스트링 -> 상태로 최초 1회 복원 (새로고침해도 유지됨)
  useEffect(() => {
    if (!routerReady) return;
    const q = router.query;
    if (q.date) setDate(q.date);
    if (q.tab === 'shopping' || q.tab === 'program') setTab(q.tab);
    if (q.channel) setChannelFilter(q.channel);
    if (q.category) setCategoryFilter(q.category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerReady]);

  // 상태 -> URL 쿼리스트링으로 동기화 (뒤로가기/새로고침 대비, 히스토리는 안 쌓음)
  useEffect(() => {
    if (!routerReady) return;
    const query = { date, tab };
    if (channelFilter) query.channel = channelFilter;
    if (categoryFilter) query.category = categoryFilter;
    router.replace({ pathname: '/', query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerReady, date, tab, channelFilter, categoryFilter]);

  useEffect(() => {
    if (!routerReady) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const table = tab === 'shopping' ? 'tvdb_shopping' : 'tvdb_program';
      let query = supabase
        .from(table)
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
  }, [routerReady, date, tab]);

  const channels = Array.from(new Set(rows.map(r => r.channel))).sort();
  const categories = Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort();

  const filtered = rows.filter(r =>
    (!channelFilter || r.channel === channelFilter) &&
    (!categoryFilter || r.category === categoryFilter)
  );

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '24px 16px', color: '#222' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>TVDB</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>홈쇼핑·방송 편성 데이터 아카이브</p>

      <div style={{ marginBottom: 20 }}>
        <AdSlot slot="home_top" label="광고" slotData={topSlot} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}
        />
        <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => { setTab('shopping'); setChannelFilter(''); setCategoryFilter(''); }}
            style={{ padding: '6px 14px', border: 'none', background: tab === 'shopping' ? '#222' : '#fff', color: tab === 'shopping' ? '#fff' : '#222', cursor: 'pointer' }}
          >홈쇼핑</button>
          <button
            onClick={() => { setTab('program'); setChannelFilter(''); setCategoryFilter(''); }}
            style={{ padding: '6px 14px', border: 'none', background: tab === 'program' ? '#222' : '#fff', color: tab === 'program' ? '#fff' : '#222', cursor: 'pointer' }}
          >일반방송</button>
        </div>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
          <option value="">전체 채널</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {tab === 'shopping' && (
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
            <option value="">전체 분류</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length}건</span>
      </div>

      {loading && <p>불러오는 중...</p>}
      {error && <p style={{ color: 'crimson' }}>에러: {error}</p>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #222' }}>
              <th style={{ padding: '8px 6px' }}>시간</th>
              <th style={{ padding: '8px 6px' }}>채널</th>
              <th style={{ padding: '8px 6px' }}>{tab === 'shopping' ? '상품명' : '프로그램명'}</th>
              {tab === 'shopping' && <th style={{ padding: '8px 6px' }}>분류</th>}
              {tab === 'shopping' && <th style={{ padding: '8px 6px' }}>가격</th>}
              {tab === 'program' && <th style={{ padding: '8px 6px' }}>장르</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px' }}>{r.time_start}</td>
                <td style={{ padding: '6px' }}>{r.channel}</td>
                <td style={{ padding: '6px' }}>{tab === 'shopping' ? r.product_name : r.program_name}</td>
                {tab === 'shopping' && <td style={{ padding: '6px' }}>{r.category}</td>}
                {tab === 'shopping' && <td style={{ padding: '6px' }}>{r.price}</td>}
                {tab === 'program' && <td style={{ padding: '6px' }}>{r.genre}</td>}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: '#888' }}>이 날짜엔 데이터가 없습니다.</td></tr>
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
  );
}
