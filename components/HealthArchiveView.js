
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Supabase REST가 한 번에 내려주는 행 수를 서버 설정상 1000행으로 잘라버리기 때문에,
// tvdb_program_episodes 전체(6천여 건)를 다 훑으려면 끝까지 페이지네이션해야 한다
// (다른 admin 패널들의 fetchAllPages/loadChannels 패턴과 동일).
async function fetchAllEpisodeSummary() {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('tvdb_program_episodes')
      .select('channel, program_name, air_date')
      .range(from, from + PAGE - 1);
    if (error) break;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// 회차별 내용은 프로그램을 클릭했을 때만 불러온다(요약 목록 단계에서 content까지 전부
// 내려받으면 6천여 건의 본문 텍스트를 매번 로딩해야 해서 느려짐).
function EpisodeModal({ channel, programName, episodes, onClose }) {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>[{channel}] {programName} — 회차별 내용</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        {episodes && episodes.length > 0 && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
            총 {episodes.length}회 · 최종 방영일 {episodes[0].air_date}
          </div>
        )}
        {!episodes ? <p style={{ margin: 0, color: '#888' }}>불러오는 중...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888' }}>
                <th style={{ padding: 4, width: 64 }}>회차</th>
                <th style={{ padding: 4, width: 90 }}>방영일</th>
                <th style={{ padding: 4 }}>내용</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map(ep => (
                <tr key={ep.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{ep.episode_no}</td>
                  <td style={{ padding: 4, color: '#888', whiteSpace: 'nowrap' }}>{ep.air_date}</td>
                  <td style={{ padding: 4 }}>{ep.content}</td>
                </tr>
              ))}
              {episodes.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 8, color: '#888' }}>등록된 회차가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// tvdb_program_episodes에 회차가 실제로 들어간 프로그램들만 여기 모인다 — 즉 이 테이블
// 자체가 "건강·생활·먹거리 다시보기 아카이브" 대상 목록이라 tvdb_program_info.is_health_content로
// 다시 걸러낼 필요가 없다(수집 단계에서 이미 건강 프로그램만 골라 넣었음).
export default function HealthArchiveView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState('');
  const [opened, setOpened] = useState(null); // { channel, program_name }
  const [episodes, setEpisodes] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllEpisodeSummary().then(data => {
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const byChannel = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!r.channel || !r.program_name) continue;
      map[r.channel] ??= {};
      const p = (map[r.channel][r.program_name] ??= { count: 0, latest: null });
      p.count += 1;
      if (r.air_date && (!p.latest || r.air_date > p.latest)) p.latest = r.air_date;
    }
    const result = {};
    for (const ch of Object.keys(map)) {
      // 최근에 갱신된(최신 방영일이 가까운) 프로그램이 위로 오도록 정렬 — "요즘 뭐하나" 훑어보기용 페이지라서.
      result[ch] = Object.entries(map[ch])
        .map(([program_name, v]) => ({ program_name, ...v }))
        .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    }
    return result;
  }, [rows]);

  const channels = useMemo(
    () => Object.keys(byChannel).sort((a, b) => byChannel[b].length - byChannel[a].length),
    [byChannel]
  );

  useEffect(() => {
    if (!activeChannel && channels.length > 0) setActiveChannel(channels[0]);
  }, [channels, activeChannel]);

  async function openProgram(channel, programName) {
    setOpened({ channel, program_name: programName });
    setEpisodes(null);
    const { data, error } = await supabase.from('tvdb_program_episodes').select('*')
      .eq('channel', channel).eq('program_name', programName)
      .order('air_date', { ascending: false });
    if (error) { setEpisodes([]); return; }
    setEpisodes(data || []);
  }

  if (loading) return <p>불러오는 중...</p>;

  const programs = byChannel[activeChannel] || [];
  const totalPrograms = Object.values(byChannel).reduce((sum, list) => sum + list.length, 0);

  return (
    <div>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        각 채널에서 수집한 건강·생활·먹거리 프로그램의 다시보기 회차를 모았습니다.
        총 {channels.length}개 채널 · {totalPrograms}개 프로그램 · {rows.length}건 회차 —
        프로그램을 클릭하면 회차별 방영일과 내용을 볼 수 있습니다.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {channels.map(ch => (
          <button key={ch} onClick={() => setActiveChannel(ch)} style={{
            padding: '8px 14px', border: '1px solid #ccc', borderRadius: 6,
            background: activeChannel === ch ? '#222' : '#fff', color: activeChannel === ch ? '#fff' : '#222',
            cursor: 'pointer', fontSize: 13,
          }}>
            {ch} <span style={{ opacity: 0.65, fontSize: 11 }}>({byChannel[ch].length})</span>
          </button>
        ))}
        {channels.length === 0 && <span style={{ color: '#888', fontSize: 13 }}>수집된 회차가 없습니다.</span>}
      </div>
      {activeChannel && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #222' }}>
              <th style={{ padding: '8px 6px' }}>프로그램명</th>
              <th style={{ padding: '8px 6px', width: 70, textAlign: 'right' }}>회차수</th>
              <th style={{ padding: '8px 6px', width: 90, textAlign: 'right' }}>최신 방영일</th>
            </tr>
          </thead>
          <tbody>
            {programs.map(p => (
              <tr key={p.program_name} onClick={() => openProgram(activeChannel, p.program_name)}
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                <td style={{ padding: '6px' }}>{p.program_name}</td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#888' }}>{p.count}</td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#888' }}>{p.latest || '-'}</td>
              </tr>
            ))}
            {programs.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 16, color: '#888' }}>데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      )}
      <EpisodeModal
        channel={opened?.channel}
        programName={opened?.program_name}
        episodes={episodes}
        onClose={() => setOpened(null)}
      />
    </div>
  );
}
