
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';
import UnclassifiedReview from './UnclassifiedReview';
import CollectionStatus from './CollectionStatus';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dowKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DOW[d.getDay()];
}
function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function ShoppingPanel({ showToast }) {
  const router = useRouter();
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [schedule, setSchedule] = useState([]); // 선택 채널의 최근 7일 편성
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('status'); // 'status' | 'channel' | 'unclassified'

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => { if (activeChannel) loadChannelData(activeChannel); }, [activeChannel]);

  // 새로고침해도 어느 탭(수집현황/채널별편성표/미분류검토)에 있었는지 유지
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.tab === 'shopping' && ['status', 'channel', 'unclassified'].includes(q.view)) {
      setViewMode(q.view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // 탭/채널/날짜 선택 -> URL 쿼리스트링 동기화 (새로고침해도 유지됨)
  useEffect(() => {
    if (!router.isReady) return;
    const query = { tab: 'shopping', view: viewMode };
    if (viewMode === 'channel' && activeChannel) {
      query.channel = activeChannel;
      if (selectedDate) query.date = selectedDate;
    }
    router.replace({ pathname: '/admin', query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeChannel, selectedDate]);

  async function loadChannels() {
    // Supabase REST가 한 번에 내려주는 행 수를 서버 설정상 잘라버리기 때문에(보통 1000행),
    // 전체 채널을 다 훑으려면 페이지네이션으로 끝까지 가져와야 함 (안 그러면 데이터가 많아질수록
    // 뒤쪽에 있는 채널이 목록에서 통째로 빠져버림).
    const PAGE = 1000;
    let allRows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('tvdb_shopping').select('channel').range(from, from + PAGE - 1);
      if (error) break;
      allRows = allRows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const uniq = Array.from(new Set(allRows.map(r => r.channel).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    setChannels(uniq);
    if (uniq.length > 0) {
      const q = router.query;
      const fromQuery = q.tab === 'shopping' && q.channel && uniq.includes(q.channel) ? q.channel : uniq[0];
      setActiveChannel(fromQuery);
    } else {
      setLoading(false);
    }
  }

  async function loadChannelData(channel) {
    setLoading(true);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const fromDate = weekAgo.toISOString().slice(0, 10);

    const [{ data: sched }, { data: noteRow }] = await Promise.all([
      supabase.from('tvdb_shopping').select('id, broadcast_date, time_start, product_name, category, price')
        .eq('channel', channel).gte('broadcast_date', fromDate)
        .order('broadcast_date', { ascending: true }).order('time_start', { ascending: true }),
      supabase.from('tvdb_channel_notes').select('*').eq('channel', channel).maybeSingle(),
    ]);

    setSchedule(sched || []);
    setNote(noteRow?.note || '');
    setSavedNote(noteRow?.note || '');

    const availableDates = Array.from(new Set((sched || []).map(r => r.broadcast_date))).sort();
    const q = router.query;
    const wantedDate = q.tab === 'shopping' && q.channel === channel && q.date ? q.date : '';
    setSelectedDate(
      wantedDate && availableDates.includes(wantedDate) ? wantedDate : (availableDates[availableDates.length - 1] || '')
    );

    setLoading(false);
  }

  async function saveNote() {
    const { error } = await supabase.from('tvdb_channel_notes').upsert({
      channel: activeChannel, note: note.trim(), updated_at: new Date().toISOString(),
    }, { onConflict: 'channel' });
    if (error) { showToast('❌ 메모 저장 실패: ' + error.message); return; }
    setSavedNote(note.trim());
    showToast(`✅ [${activeChannel}] 메모 저장 완료`);
  }

  const byDate = {};
  schedule.forEach(row => {
    if (!byDate[row.broadcast_date]) byDate[row.broadcast_date] = [];
    byDate[row.broadcast_date].push(row);
  });
  const dates = Object.keys(byDate).sort();
  const rowsOfSelectedDate = byDate[selectedDate] || [];

  return (
    <div>
      <div style={S.cardTitle}>🛍️ 홈쇼핑 정보 관리</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setViewMode('status')} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #d1e8d1',
          background: viewMode === 'status' ? '#16a34a' : '#fff',
          color: viewMode === 'status' ? '#fff' : '#4b6e4b',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>📊 채널별 수집 현황</button>
        <button onClick={() => setViewMode('channel')} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #d1e8d1',
          background: viewMode === 'channel' ? '#16a34a' : '#fff',
          color: viewMode === 'channel' ? '#fff' : '#4b6e4b',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>📅 채널별 편성표</button>
        <button onClick={() => setViewMode('unclassified')} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #d1e8d1',
          background: viewMode === 'unclassified' ? '#16a34a' : '#fff',
          color: viewMode === 'unclassified' ? '#fff' : '#4b6e4b',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>🔍 미분류 검토</button>
      </div>

      {viewMode === 'status' && <CollectionStatus />}
      {viewMode === 'unclassified' && <UnclassifiedReview showToast={showToast} />}

      {viewMode === 'channel' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {channels.map(ch => (
              <button key={ch} onClick={() => { setActiveChannel(ch); setSelectedDate(''); }} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #d1e8d1',
                background: activeChannel === ch ? '#16a34a' : '#fff',
                color: activeChannel === ch ? '#fff' : '#4b6e4b',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              }}>{ch}</button>
            ))}
          </div>

          {!activeChannel ? <p>채널 데이터가 없습니다.</p> : loading ? <p>불러오는 중...</p> : (
            <>
              <div style={S.card}>
                <div style={S.cardTitle}>📅 {activeChannel} — 최근 {dates.length}일 편성</div>
                {dates.length === 0 && <p style={{ color: '#8aaa8a' }}>편성 데이터가 없습니다. (매일 수집이 쌓이면 최대 7일치가 여기 보입니다)</p>}

                {dates.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
                    {dates.map(d => {
                      const active = d === selectedDate;
                      return (
                        <button key={d} onClick={() => setSelectedDate(d)} style={{
                          flex: '1 0 60px', padding: '6px 4px', borderRadius: 8,
                          border: `1.5px solid ${active ? '#16a34a' : '#d1e8d1'}`,
                          background: active ? '#16a34a' : '#fff',
                          color: active ? '#fff' : '#4b6e4b',
                          cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{mdKo(d)}</div>
                          <div style={{ fontSize: 11, opacity: 0.85 }}>{dowKo(d)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedDate && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {rowsOfSelectedDate.map(row => (
                        <tr key={row.id} style={{ borderBottom: '1px solid #eef6ee' }}>
                          <td style={{ padding: '4px 6px', width: 70, color: '#8aaa8a' }}>{row.time_start?.slice(0, 5)}</td>
                          <td style={{ padding: '4px 6px' }}>{row.product_name}</td>
                          <td style={{ padding: '4px 6px', color: '#4b6e4b' }}>{row.category}</td>
                          <td style={{ padding: '4px 6px', color: '#8aaa8a', textAlign: 'right' }}>{row.price}</td>
                        </tr>
                      ))}
                      {rowsOfSelectedDate.length === 0 && (
                        <tr><td style={{ padding: 16, color: '#8aaa8a' }}>이 날짜엔 데이터가 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>📝 {activeChannel} 정보 출처 메모</div>
                <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 12 }}>
                  홈쇼핑은 상품명이 거의 매일 바뀌어서 상품 단위 등록 대신 채널 단위 메모만 관리합니다.
                </p>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} style={S.textarea}
                  placeholder="예: 공식 앱 상품상세 페이지에서 확인 가능" />
                <button type="button" onClick={saveNote} disabled={note === savedNote}
                  style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, marginTop: 8, opacity: note === savedNote ? 0.5 : 1 }}>
                  메모 저장
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
