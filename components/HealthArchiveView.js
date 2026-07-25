
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Supabase REST가 한 번에 내려주는 행 수를 서버 설정상 1000행으로 잘라버리기 때문에,
// tvdb_program_episodes 전체(6천여 건)를 다 훑으려면 끝까지 페이지네이션해야 한다
// (다른 admin 패널들의 fetchAllPages/loadChannels 패턴과 동일).
async function fetchAllPages(table, select) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) break;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// has_replay/replay_url은 채널 공식 편성표를 확인해서 다시보기 링크가 실제로 있는 프로그램만
// true/URL로 채워진 값이다(program.js/BroadcastPanel.js의 ReplayBadge와 동일 규칙) — null이면
// 아직 확인 안 한 것이라 뱃지를 안 띄운다.
function ReplayBadge({ hasReplay }) {
  if (hasReplay === null || hasReplay === undefined) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
      background: hasReplay ? '#dbeafe' : '#f3f4f6', color: hasReplay ? '#2563eb' : '#9ca3af',
    }}>{hasReplay ? '📺 다시보기' : '다시보기 없음'}</span>
  );
}

// 회차별 내용은 프로그램을 클릭했을 때만 불러온다(요약 목록 단계에서 content까지 전부
// 내려받으면 6천여 건의 본문 텍스트를 매번 로딩해야 해서 느려짐).
function EpisodeModal({ channel, programName, info, episodes, onClose }) {
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
        {info?.has_replay === true && (
          info.replay_url ? (
            <a href={info.replay_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 8, textDecoration: 'none' }}>
              <ReplayBadge hasReplay={true} /> <span style={{ fontSize: 11.5, color: '#2563eb' }}>공식 다시보기로 이동 ↗</span>
            </a>
          ) : (
            <div style={{ marginBottom: 8 }}><ReplayBadge hasReplay={true} /></div>
          )
        )}
        {info?.has_replay === false && (
          <div style={{ marginBottom: 8 }}><ReplayBadge hasReplay={false} /></div>
        )}
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

// 삭제는 되돌릴 수 없으니 버튼 클릭 즉시 지우지 않고 이 모달로 한 번 더 확인시킨다
// (BroadcastPanel.js의 ConfirmModal과 동일한 패턴).
function ConfirmModal({ confirm, onConfirm, onCancel, busy }) {
  if (!confirm) return null;
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 420, width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>정말 삭제할까요?</div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          "[{confirm.channel}] {confirm.program_name}" 등록 정보를 삭제합니다. 이 화면과 관리자
          화면 양쪽에서 동일하게 사라집니다(회차 원본 데이터는 그대로 남습니다).
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} disabled={busy} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #dc2626', background: '#dc2626',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>{busy ? '삭제 중...' : '삭제'}</button>
          <button type="button" onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff',
            color: '#222', fontSize: 13, cursor: 'pointer',
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// tvdb_program_episodes만 보고 채널·프로그램 목록을 만들면, 예전에 회차 수집 단계에서
// "같은 회차를 라벨만 바꿔 여러 program_name에 중복 삽입"해둔 프로그램들(예: TV조선 "왕은 무얼
// 자셨는가"/"1부"/"2부"/"베스트")이 전부 별도 프로그램인 것처럼 나열되는 문제가 있었다.
// 관리자가 tvdb_program_info에서 "등록"/"삭제"로 관리하는 목록이 이미 그 판단(어떤 라벨을
// 정식 이름으로 남길지)을 담고 있으므로, 이 페이지는 그 목록에 있는 (channel, program_name)만
// 통과시켜 항상 관리자 화면과 동일하게 맞춘다 — 회차 데이터 자체는 건드리지 않는다.
export default function HealthArchiveView() {
  const [rows, setRows] = useState([]);
  const [infoMap, setInfoMap] = useState(null); // Map('channel|program_name' -> {replay_url, has_replay})
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState('');
  const [opened, setOpened] = useState(null); // { channel, program_name }
  const [episodes, setEpisodes] = useState(null);
  const [confirm, setConfirm] = useState(null); // { channel, program_name } | null
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAllPages('tvdb_program_episodes', 'channel, program_name, air_date'),
      fetchAllPages('tvdb_program_info', 'channel, program_name, replay_url, has_replay'),
    ]).then(([episodeRows, infoRows]) => {
      if (cancelled) return;
      setRows(episodeRows);
      const map = new Map();
      infoRows.forEach(i => map.set(`${i.channel}|${i.program_name}`, { replay_url: i.replay_url, has_replay: i.has_replay }));
      setInfoMap(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const byChannel = useMemo(() => {
    if (!infoMap) return {};
    const map = {};
    for (const r of rows) {
      if (!r.channel || !r.program_name) continue;
      if (!infoMap.has(`${r.channel}|${r.program_name}`)) continue; // 관리자 미등록/삭제된 라벨은 제외
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
  }, [rows, infoMap]);

  const channels = useMemo(
    () => Object.keys(byChannel).sort((a, b) => byChannel[b].length - byChannel[a].length),
    [byChannel]
  );

  useEffect(() => {
    if (!activeChannel && channels.length > 0) setActiveChannel(channels[0]);
  }, [channels, activeChannel]);

  async function openProgram(channel, programName) {
    setOpened({ channel, program_name: programName, info: infoMap.get(`${channel}|${programName}`) });
    setEpisodes(null);
    const { data, error } = await supabase.from('tvdb_program_episodes').select('*')
      .eq('channel', channel).eq('program_name', programName)
      .order('air_date', { ascending: false });
    if (error) { setEpisodes([]); return; }
    setEpisodes(data || []);
  }

  function askDelete(channel, programName) {
    setConfirm({ channel, program_name: programName });
  }

  // tvdb_program_info에서 지우는 것 자체가 관리자 화면(BroadcastPanel의 "삭제")과 완전히 같은
  // 동작이라, 여기서 지우면 관리자에도 반영되고 관리자에서 지운 것도 다음에 이 페이지를 열 때
  // infoMap에서 자동으로 빠진다(둘 다 tvdb_program_info를 그대로 읽기만 하기 때문).
  async function handleConfirmDelete() {
    if (!confirm) return;
    setConfirmBusy(true);
    const { error } = await supabase.from('tvdb_program_info').delete()
      .eq('channel', confirm.channel).eq('program_name', confirm.program_name);
    setConfirmBusy(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setInfoMap(prev => {
      const next = new Map(prev);
      next.delete(`${confirm.channel}|${confirm.program_name}`);
      return next;
    });
    if (opened && opened.channel === confirm.channel && opened.program_name === confirm.program_name) {
      setOpened(null);
    }
    setConfirm(null);
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
              <th style={{ padding: '8px 6px', width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {programs.map(p => {
              const info = infoMap.get(`${activeChannel}|${p.program_name}`);
              return (
              <tr key={p.program_name} onClick={() => openProgram(activeChannel, p.program_name)}
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                <td style={{ padding: '6px' }}>
                  {p.program_name}
                  {info?.has_replay != null && <span style={{ marginLeft: 6 }}><ReplayBadge hasReplay={info.has_replay} /></span>}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#888' }}>{p.count}</td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#888' }}>{p.latest || '-'}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>
                  <button onClick={e => { e.stopPropagation(); askDelete(activeChannel, p.program_name); }}
                    style={{
                      padding: '3px 9px', fontSize: 11.5, borderRadius: 6, border: '1px solid #fecaca',
                      background: '#fff', color: '#dc2626', cursor: 'pointer',
                    }}>삭제</button>
                </td>
              </tr>
              );
            })}
            {programs.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 16, color: '#888' }}>데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      )}
      <EpisodeModal
        channel={opened?.channel}
        programName={opened?.program_name}
        info={opened?.info}
        episodes={episodes}
        onClose={() => setOpened(null)}
      />
      <ConfirmModal confirm={confirm} onConfirm={handleConfirmDelete} onCancel={() => setConfirm(null)} busy={confirmBusy} />
    </div>
  );
}
