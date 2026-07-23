import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';
import BroadcastCollectionStatus from './BroadcastCollectionStatus';
import BroadcastChannelNotes from './BroadcastChannelNotes';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dowKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DOW[d.getDay()];
}
function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const emptyForm = {
  program_name: '', genre: '', description: '', source_url: '', verified: true,
  air_day: '', air_time: '', is_airing: true, broadcast_memo: '', replay_url: '',
};

function StatusBadge({ isAiring }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: isAiring ? '#dcfce7' : '#f3f4f6', color: isAiring ? '#16a34a' : '#6b7280',
    }}>{isAiring ? '방송중' : '종영'}</span>
  );
}

// has_replay는 채널 공식 편성표를 훑어서 실제로 다시보기 링크가 붙어있던 프로그램만 true/false로
// 확정한 값이다(2026-07-23, 채널A 32개 확인). 아직 확인 안 한 프로그램은 null이라 뱃지를 안 띄운다 —
// 확인도 안 했는데 "다시보기 없음"으로 단정하면 안 되니까.
function ReplayBadge({ hasReplay }) {
  if (hasReplay === null || hasReplay === undefined) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: hasReplay ? '#dbeafe' : '#f3f4f6', color: hasReplay ? '#2563eb' : '#9ca3af',
    }}>{hasReplay ? '📺 다시보기' : '다시보기 없음'}</span>
  );
}

// is_health_content: 블로그 소스로 쓸 "건강·생활·먹거리" 계열 프로그램만 공식 프로그램 소개를 보고
// 사람이 판단해 표시한 값(2026-07-24). null이면 아직 분류 안 한 것 — 확인도 안 하고 "아니오"로
// 단정하지 않는다는 원칙은 ReplayBadge와 동일.
function HealthBadge({ isHealth }) {
  if (isHealth === null || isHealth === undefined) return null;
  if (!isHealth) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: '#fef3c7', color: '#b45309',
    }}>🥗 건강·생활·먹거리</span>
  );
}

// "수정" 버튼을 눌렀을 때 맨 위 등록 폼으로 스크롤시키던 방식은, 목록 깊숙이 스크롤해서 보고 있던
// 사용자 입장에선 "여기서 바로 안 되고 왜 위로 튕기지?"로 느껴진다. 그 자리에서 바로 편집할 수 있게
// 같은 필드 구성의 모달로 뺐다.
function EditModal({ form, setForm, onSave, onCancel, saving }) {
  if (!form) return null;
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 520, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>프로그램 정보 수정</div>
          <button onClick={onCancel} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        <form onSubmit={onSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>프로그램명</label>
            <input value={form.program_name}
              onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>요일</label>
              <input placeholder="예: 화,수,목 또는 월~금" value={form.air_day}
                onChange={e => setForm(f => ({ ...f, air_day: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>시간</label>
              <input placeholder="예: 저녁 7시 또는 22:00(1부)/23:20(2부)" value={form.air_time}
                onChange={e => setForm(f => ({ ...f, air_time: e.target.value }))} style={S.input} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>방송 상태</label>
            <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4b6e4b' }}>
                <input type="radio" checked={form.is_airing} onChange={() => setForm(f => ({ ...f, is_airing: true }))} />
                현재 방송중
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4b6e4b' }}>
                <input type="radio" checked={!form.is_airing} onChange={() => setForm(f => ({ ...f, is_airing: false }))} />
                종영(끝난 방송)
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>장르</label>
            <input value={form.genre}
              onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} style={S.input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>설명</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={S.textarea} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>방송메모</label>
            <textarea rows={2} placeholder="예: 특별판 종료 후 2026-08 정규 편성 재개 예정" value={form.broadcast_memo}
              onChange={e => setForm(f => ({ ...f, broadcast_memo: e.target.value }))} style={S.textarea} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>출처 URL</label>
            <input value={form.source_url}
              onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} style={S.input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>다시보기 URL</label>
            <input placeholder="https://... (VOD/다시보기 페이지)" value={form.replay_url}
              onChange={e => setForm(f => ({ ...f, replay_url: e.target.value }))} style={S.input} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: '#4b6e4b' }}>
            <input type="checkbox" checked={form.verified}
              onChange={e => setForm(f => ({ ...f, verified: e.target.checked }))} />
            출처로 확인됨 (체크 해제 시 "확인 안 됨"으로 표시)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#4b6e4b' }}>
            <input type="checkbox" checked={!!form.is_health_content}
              onChange={e => setForm(f => ({ ...f, is_health_content: e.target.checked }))} />
            🥗 건강·생활·먹거리 콘텐츠(블로그 소스로 활용)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button type="button" onClick={onCancel} style={S.btnGhost}>취소</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 회차 목록을 프로그램 행 아래에 펼치던 방식은 목록이 길어질수록 다른 프로그램 행들이 아래로
// 밀려나서 위치를 잃어버리게 만들었다. "수정"과 같은 모달 패턴으로 통일해서 목록 위치를 유지한다.
function EpisodeModal({ programName, episodes, onClose, onToggle }) {
  if (!programName) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 640, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{programName} — 회차별 내용</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        {!episodes ? <p style={{ margin: 0, color: '#8aaa8a' }}>불러오는 중...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8aaa8a' }}>
                <th style={{ padding: 4, width: 40 }}>사용</th>
                <th style={{ padding: 4, width: 64 }}>회차</th>
                <th style={{ padding: 4, width: 90 }}>방영일</th>
                <th style={{ padding: 4 }}>내용</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map(ep => (
                <tr key={ep.id} style={{ borderBottom: '1px solid #eef6ee' }}>
                  <td style={{ padding: 4 }}>
                    <input type="checkbox" checked={!!ep.is_selected}
                      onChange={() => onToggle(ep)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{ep.episode_no}</td>
                  <td style={{ padding: 4, color: '#8aaa8a', whiteSpace: 'nowrap' }}>{ep.air_date}</td>
                  <td style={{ padding: 4 }}>{ep.content}</td>
                </tr>
              ))}
              {episodes.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 8, color: '#8aaa8a' }}>등록된 회차가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function BroadcastPanel({ showToast }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState('status'); // 'status' | 'channel' | 'notes'
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

  // 기존 항목 "수정"은 이 상태로 뜨는 모달에서 처리한다(위 form/handleSubmit은 신규 등록 전용).
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // 건강·생활·먹거리 프로그램의 회차별 내용 + "사용" 체크박스(블로그 소재 고르기용).
  // program_name -> episode 배열. 모달을 열 때만 불러온다(전부 미리 불러오면 느려짐).
  const [episodes, setEpisodes] = useState({});
  const [expandedProgram, setExpandedProgram] = useState(null);

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => { if (activeChannel) loadChannelData(activeChannel); }, [activeChannel]);

  // 새로고침해도 어느 탭(수집현황/채널별편성표/채널별메모)에 있었는지 유지
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.tab === 'broadcast' && ['status', 'channel', 'notes'].includes(q.view)) {
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
    setEpisodes({});
    setExpandedProgram(null);
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
    // 등록된 프로그램 목록은 원래 DB 조회 순서 그대로 쌓여서 뒤죽박죽으로 보였다 — 가나다순으로 정렬.
    setInfoRows([...(info || [])].sort((a, b) => a.program_name.localeCompare(b.program_name, 'ko')));
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
    setEditForm({
      program_name: row.program_name,
      genre: row.genre || '',
      description: row.description || '',
      source_url: row.source_url || '',
      verified: row.verified,
      air_day: row.air_day || '',
      air_time: row.air_time || '',
      is_airing: row.is_airing !== false,
      broadcast_memo: row.broadcast_memo || '',
      replay_url: row.replay_url || '',
      is_health_content: !!row.is_health_content,
    });
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
      air_day: form.air_day.trim() || null,
      air_time: form.air_time.trim() || null,
      is_airing: !!form.is_airing,
      broadcast_memo: form.broadcast_memo.trim() || null,
      replay_url: form.replay_url.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setForm(emptyForm);
    loadChannelData(activeChannel);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editForm.program_name.trim()) { showToast('❌ 프로그램명은 필수입니다'); return; }
    setEditSaving(true);
    const { error } = await supabase.from('tvdb_program_info').upsert({
      program_name: editForm.program_name.trim(),
      channel: activeChannel,
      genre: editForm.genre.trim() || null,
      description: editForm.description.trim() || null,
      source_url: editForm.source_url.trim() || null,
      verified: !!editForm.verified,
      air_day: editForm.air_day.trim() || null,
      air_time: editForm.air_time.trim() || null,
      is_airing: !!editForm.is_airing,
      broadcast_memo: editForm.broadcast_memo.trim() || null,
      replay_url: editForm.replay_url.trim() || null,
      is_health_content: !!editForm.is_health_content,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setEditSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setEditForm(null);
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

  async function toggleEpisodes(programName) {
    setExpandedProgram(programName);
    if (!episodes[programName]) {
      const { data, error } = await supabase.from('tvdb_program_episodes').select('*')
        .eq('channel', activeChannel).eq('program_name', programName)
        .order('air_date', { ascending: false });
      if (error) { showToast('❌ 회차 조회 실패: ' + error.message); return; }
      setEpisodes(e => ({ ...e, [programName]: data || [] }));
    }
  }

  async function toggleEpisodeSelected(programName, ep) {
    const next = !ep.is_selected;
    setEpisodes(e => ({
      ...e,
      [programName]: e[programName].map(x => x.id === ep.id ? { ...x, is_selected: next } : x),
    }));
    const { error } = await supabase.from('tvdb_program_episodes').update({ is_selected: next }).eq('id', ep.id);
    if (error) {
      setEpisodes(e => ({
        ...e,
        [programName]: e[programName].map(x => x.id === ep.id ? { ...x, is_selected: !next } : x),
      }));
      showToast('❌ 저장 실패: ' + error.message);
    }
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
        <button onClick={() => setViewMode('notes')} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #d1e8d1',
          background: viewMode === 'notes' ? '#16a34a' : '#fff',
          color: viewMode === 'notes' ? '#fff' : '#4b6e4b',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>📝 채널별 메모</button>
      </div>

      {viewMode === 'status' && <BroadcastCollectionStatus />}
      {viewMode === 'notes' && <BroadcastChannelNotes showToast={showToast} />}

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
                      {rowsOfSelectedDate.map(row => {
                        const info = infoRows.find(i => row.program_name.startsWith(i.program_name));
                        return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #eef6ee' }}>
                          <td style={{ padding: '4px 6px', width: 70, color: '#8aaa8a' }}>{row.time_start?.slice(0, 5)}</td>
                          <td style={{ padding: '4px 6px' }}>
                            {row.program_name}
                            {info?.is_health_content && <span style={{ marginLeft: 6 }}><HealthBadge isHealth={info.is_health_content} /></span>}
                          </td>
                          <td style={{ padding: '4px 6px', color: '#4b6e4b' }}>{row.genre}</td>
                          <td style={{ padding: '4px 6px', color: '#8aaa8a', fontSize: 12 }}>
                            {info ? [info.air_day, info.air_time].filter(Boolean).join(' ') || '-' : ''}
                          </td>
                        </tr>
                        );
                      })}
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
                <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 14 }}>
                  이미 등록된 항목을 고칠 땐 아래 목록의 "수정" 버튼(모달)을 쓰세요 — 이 폼은 신규 등록 전용입니다.
                </p>
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>프로그램명</label>
                    <input placeholder="예: 엄지의 제왕" value={form.program_name}
                      onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>요일</label>
                      <input placeholder="예: 화,수,목 또는 월~금" value={form.air_day}
                        onChange={e => setForm(f => ({ ...f, air_day: e.target.value }))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>시간</label>
                      <input placeholder="예: 저녁 7시 또는 22:00(1부)/23:20(2부)" value={form.air_time}
                        onChange={e => setForm(f => ({ ...f, air_time: e.target.value }))} style={S.input} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>방송 상태</label>
                    <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4b6e4b' }}>
                        <input type="radio" checked={form.is_airing} onChange={() => setForm(f => ({ ...f, is_airing: true }))} />
                        현재 방송중
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4b6e4b' }}>
                        <input type="radio" checked={!form.is_airing} onChange={() => setForm(f => ({ ...f, is_airing: false }))} />
                        종영(끝난 방송)
                      </label>
                    </div>
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
                    <label style={S.label}>방송메모</label>
                    <textarea rows={2} placeholder="예: 특별판 종료 후 2026-08 정규 편성 재개 예정" value={form.broadcast_memo}
                      onChange={e => setForm(f => ({ ...f, broadcast_memo: e.target.value }))} style={S.textarea} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>출처 URL</label>
                    <input placeholder="https://..." value={form.source_url}
                      onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} style={S.input} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>다시보기 URL</label>
                    <input placeholder="https://... (VOD/다시보기 페이지)" value={form.replay_url}
                      onChange={e => setForm(f => ({ ...f, replay_url: e.target.value }))} style={S.input} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: '#4b6e4b' }}>
                    <input type="checkbox" checked={form.verified}
                      onChange={e => setForm(f => ({ ...f, verified: e.target.checked }))} />
                    출처로 확인됨 (체크 해제 시 "확인 안 됨"으로 표시)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#4b6e4b' }}>
                    <input type="checkbox" checked={!!form.is_health_content}
                      onChange={e => setForm(f => ({ ...f, is_health_content: e.target.checked }))} />
                    🥗 건강·생활·먹거리 콘텐츠(블로그 소스로 활용)
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
                      <th style={{ padding: 6 }}>요일</th>
                      <th style={{ padding: 6 }}>시간</th>
                      <th style={{ padding: 6 }}>상태</th>
                      <th style={{ padding: 6 }}>장르</th>
                      <th style={{ padding: 6 }}>확인됨</th>
                      <th style={{ padding: 6 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {infoRows.map(row => (
                      <tr key={row.program_name} style={{ borderBottom: '1px solid #eef6ee' }}>
                        <td style={{ padding: 6 }}>
                          {row.program_name}
                          {row.has_replay === true && row.replay_url && (
                            <a href={row.replay_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, textDecoration: 'none' }}>
                              <ReplayBadge hasReplay={row.has_replay} />
                            </a>
                          )}
                          {row.has_replay === false && (
                            <span style={{ marginLeft: 6 }}><ReplayBadge hasReplay={row.has_replay} /></span>
                          )}
                          {row.is_health_content && <span style={{ marginLeft: 6 }}><HealthBadge isHealth={row.is_health_content} /></span>}
                        </td>
                        <td style={{ padding: 6, color: '#4b6e4b' }}>{row.air_day}</td>
                        <td style={{ padding: 6, color: '#4b6e4b' }}>{row.air_time}</td>
                        <td style={{ padding: 6 }}><StatusBadge isAiring={row.is_airing !== false} /></td>
                        <td style={{ padding: 6 }}>{row.genre}</td>
                        <td style={{ padding: 6 }}>{row.verified ? '✅' : '❌'}</td>
                        <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                          <button onClick={() => startEdit(row)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>수정</button>
                          {row.is_health_content && (
                            <button onClick={() => toggleEpisodes(row.program_name)}
                              style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12, marginLeft: 4 }}>
                              회차 보기
                            </button>
                          )}
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

      <EditModal form={editForm} setForm={setEditForm} onSave={handleEditSubmit} onCancel={() => setEditForm(null)} saving={editSaving} />
      <EpisodeModal programName={expandedProgram} episodes={episodes[expandedProgram]}
        onClose={() => setExpandedProgram(null)} onToggle={(ep) => toggleEpisodeSelected(expandedProgram, ep)} />
    </div>
  );
}
