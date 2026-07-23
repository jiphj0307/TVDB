import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';
import BroadcastCollectionStatus from './BroadcastCollectionStatus';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dowKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DOW[d.getDay()];
}
function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const emptyForm = { program_name: '', genre: '', description: '', source_url: '', verified: true };

export default function BroadcastPanel({ showToast }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState('status'); // 'status' | 'channel'
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [schedule, setSchedule] = useState([]); // 선택 채널의 최근 7일 편성
  const [infoRows, setInfoRows] = useState([]); // 선택 채널의 등록된 프로그램 정보
  const [missing, setMissing] = useState([]);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => { if (activeChannel) loadChannelData(activeChannel); }, [activeChannel]);

  // 새로고침해도 어느 탭(수집현황/채널별편성표)에 있었는지 유지
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.tab === 'broadcast' && ['status', 'channel'].includes(q.view)) {
      setViewMode(q.view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // 탭/채널/날짜 선택 -> URL 쿼리스트링 동기화 (새로고침해도 유지됨)
  useEffect(() => {
    if (!router.isReady) return;
    const query = { tab: 'broadcast', view: viewMode };
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
      const { data, error } = await supabase.from('tvdb_program').select('channel').range(from, from + PAGE - 1);
      if (error) break;
      allRows = allRows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const uniq = Array.from(new Set(allRows.map(r => r.channel).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    setChannels(uniq);
    if (uniq.length > 0) {
      const q = router.query;
      const fromQuery = q.tab === 'broadcast' && q.channel && uniq.includes(q.channel) ? q.channel : uniq[0];
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

    const [{ data: sched }, { data: info }, { data: noteRow }] = await Promise.all([
      supabase.from('tvdb_program').select('id, broadcast_date, time_start, program_name, genre')
        .eq('channel', channel).gte('broadcast_date', fromDate)
        .order('broadcast_date', { ascending: true }).order('time_start', { ascending: true }),
      supabase.from('tvdb_program_info').select('*').eq('channel', channel),
      supabase.from('tvdb_channel_notes').select('*').eq('channel', channel).maybeSingle(),
    ]);

    setSchedule(sched || []);
    setInfoRows(info || []);
    setNote(noteRow?.note || '');
    setSavedNote(noteRow?.note || '');

    const seen = new Set();
    const miss = [];
    (sched || []).forEach(p => {
      if (seen.has(p.program_name)) return;
      const matched = (info || []).some(i => p.program_name.startsWith(i.program_name));
      if (!matched) { seen.add(p.program_name); miss.push(p.program_name); }
    });
    setMissing(miss);

    const availableDates = Array.from(new Set((sched || []).map(r => r.broadcast_date))).sort();
    const todayStr = new Date().toISOString().slice(0, 10);
    const q = router.query;
    const wantedDate = q.tab === 'broadcast' && q.channel === channel && q.date ? q.date : '';
    setSelectedDate(
      wantedDate && availableDates.includes(wantedDate) ? wantedDate
        : availableDates.includes(todayStr) ? todayStr
        : (availableDates[availableDates.length - 1] || '')
    );

    setLoading(false);
  }

  function startNewFromMissing(name) {
    setForm({ ...emptyForm, program_name: name });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startEdit(row) {
    setForm({
      program_name: row.program_name,
      genre: row.genre || '',
      description: row.description || '',
      source_url: row.source_url || '',
      verified: row.verified,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.program_name.trim()) { showToast('❌ 프로그램명은 필수입니다'); return; }
    setSaving(true);
    const { error } = await supabase.from('tvdb_program_info').upsert({
      program_name: form.program_name.trim(),
      channel: activeChannel,
      genre: form.genre.trim() || null,
      description: form.description.trim() || null,
      source_url: form.source_url.trim() || null,
      verified: !!form.verified,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setForm(emptyForm);
    loadChannelData(activeChannel);
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
      <div style={S.cardTitle}>📺 일반방송 정보 관리</div>

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
      </div>

      {viewMode === 'status' && <BroadcastCollectionStatus />}

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
                          <td style={{ padding: '4px 6px' }}>{row.program_name}</td>
                          <td style={{ padding: '4px 6px', color: '#4b6e4b' }}>{row.genre}</td>
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
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} style={S.textarea}
                  placeholder="예: 나무위키에 채널 프로그램별 문서가 잘 정리돼있음" />
                <button type="button" onClick={saveNote} disabled={note === savedNote}
                  style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, marginTop: 8, opacity: note === savedNote ? 0.5 : 1 }}>
                  메모 저장
                </button>
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>🆕 프로그램 정보 등록</div>
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>프로그램명</label>
                    <input placeholder="예: 엄지의 제왕" value={form.program_name}
                      onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>장르</label>
                    <input placeholder="예: 예능(건강정보)" value={form.genre}
                      onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} style={S.input} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>설명</label>
                    <textarea placeholder="이 프로그램이 어떤 내용인지" value={form.description} rows={3}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={S.textarea} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>출처 URL</label>
                    <input placeholder="https://..." value={form.source_url}
                      onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} style={S.input} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#4b6e4b' }}>
                    <input type="checkbox" checked={form.verified}
                      onChange={e => setForm(f => ({ ...f, verified: e.target.checked }))} />
                    출처로 확인됨 (체크 해제 시 "확인 안 됨"으로 표시)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={saving} style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }}>
                      {saving ? '저장 중...' : '저장'}
                    </button>
                    <button type="button" onClick={() => setForm(emptyForm)} style={S.btnGhost}>초기화</button>
                  </div>
                </form>
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>❓ {activeChannel} 미등록 프로그램 ({missing.length}개)</div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {missing.map((name, idx) => (
                    <div key={idx} onClick={() => startNewFromMissing(name)} style={{ ...S.row, cursor: 'pointer' }}>{name}</div>
                  ))}
                  {missing.length === 0 && <p style={{ color: '#8aaa8a' }}>없음</p>}
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>✅ {activeChannel} 등록된 프로그램 ({infoRows.length}개)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #d1e8d1' }}>
                      <th style={{ padding: 6 }}>프로그램명</th>
                      <th style={{ padding: 6 }}>장르</th>
                      <th style={{ padding: 6 }}>확인됨</th>
                      <th style={{ padding: 6 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {infoRows.map(row => (
                      <tr key={row.program_name} style={{ borderBottom: '1px solid #eef6ee' }}>
                        <td style={{ padding: 6 }}>{row.program_name}</td>
                        <td style={{ padding: 6 }}>{row.genre}</td>
                        <td style={{ padding: 6 }}>{row.verified ? '✅' : '❌'}</td>
                        <td style={{ padding: 6 }}>
                          <button onClick={() => startEdit(row)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>수정</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
