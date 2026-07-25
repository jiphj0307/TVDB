
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { OTHER_LABEL } from '../lib/diseaseClassifier';

// Supabase REST가 한 번에 내려주는 행 수를 서버 설정상 1000행으로 잘라버리기 때문에,
// tvdb_program_episodes 전체(9천여 건)를 다 훑으려면 끝까지 페이지네이션해야 한다
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
// 내려받으면 9천여 건의 본문 텍스트를 매번 로딩해야 해서 느려짐) — 채널별 보기 전용.
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
// (BroadcastPanel.js의 ConfirmModal과 동일한 패턴) — 채널별 보기 전용.
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

// 채널/병명 탭 공용 버튼 — ShoppingFoodView.js의 TabButton과 동일한 스타일.
function TabButton({ label, count, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', border: '1px solid #ccc', borderRadius: 6,
      background: active ? '#222' : '#fff', color: active ? '#fff' : '#222',
      cursor: 'pointer', fontSize: 13,
    }}>
      {label} <span style={{ opacity: 0.65, fontSize: 11 }}>({count})</span>
    </button>
  );
}

function EpisodeRow({ ep }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '6px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.air_date || '-'}</td>
      <td style={{ padding: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.channel}</td>
      <td style={{ padding: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.program_name}<span style={{ color: '#aaa' }}> {ep.episode_no}회</span></td>
      <td style={{ padding: '6px' }}>{ep.content}</td>
    </tr>
  );
}

// 병명 탭 안에서는 채널·프로그램 구분 없이 모든 회차를 방영일 최신순으로 한 줄씩 보여준다.
// (사용자가 실제로 원하는 건 "이 병명에 뭐가 있나"이지 "어느 채널이 뭘 방송했나"가 아니라서,
// 채널/프로그램은 각 행의 부가 정보로만 남긴다 — 2026-07-25 인계 메모 참고.)
function DiseaseTable({ episodes }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #222', color: '#888' }}>
          <th style={{ padding: '6px', width: 90 }}>방영일</th>
          <th style={{ padding: '6px', width: 70 }}>채널</th>
          <th style={{ padding: '6px', width: 160 }}>프로그램</th>
          <th style={{ padding: '6px' }}>내용</th>
        </tr>
      </thead>
      <tbody>
        {episodes.map(ep => <EpisodeRow key={ep.id} ep={ep} />)}
        {episodes.length === 0 && (
          <tr><td colSpan={4} style={{ padding: 16, color: '#888' }}>해당 병명으로 분류된 회차가 없습니다.</td></tr>
        )}
      </tbody>
    </table>
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

  // 기본 화면은 병명별 보기. 채널별 보기는 예전 화면을 그대로 보조 탭으로 남겨둔 것
  // (2026-07-25 사용자 확인: 완전 삭제 대신 보조 탭 유지).
  const [viewMode, setViewMode] = useState('disease'); // 'disease' | 'channel'

  const [activeDisease, setActiveDisease] = useState('');
  const [activeChannel, setActiveChannel] = useState('');

  const [opened, setOpened] = useState(null); // { channel, program_name } — 채널별 보기 전용
  const [episodes, setEpisodes] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAllPages('tvdb_program_episodes', 'id, channel, program_name, episode_no, air_date, content, disease_tags'),
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

  // 관리자 미등록/삭제된 라벨을 제외한, 이 화면에서 실제로 다룰 회차만 미리 걸러둔다.
  const validRows = useMemo(() => {
    if (!infoMap) return [];
    return rows.filter(r => r.channel && r.program_name && infoMap.has(`${r.channel}|${r.program_name}`));
  }, [rows, infoMap]);

  // 병명 하나가 여러 카테고리에 걸치면(예: "당뇨와 비만을 함께...") 각 탭에 전부 나타난다 —
  // 병명 탭은 "이 병명 보여줘"가 목적이라 중복 노출이 자연스럽다(채널 탭처럼 소속이 하나뿐인
  // 구조가 아님). disease_tags가 비어 있으면 '기타' 탭 하나에만 들어간다.
  const byDisease = useMemo(() => {
    const map = {};
    const other = [];
    for (const r of validRows) {
      const tags = r.disease_tags;
      if (!tags || tags.length === 0) {
        other.push(r);
        continue;
      }
      for (const tag of tags) {
        (map[tag] ??= []).push(r);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (b.air_date || '').localeCompare(a.air_date || ''));
    }
    other.sort((a, b) => (b.air_date || '').localeCompare(a.air_date || ''));
    map[OTHER_LABEL] = other;
    return map;
  }, [validRows]);

  // 방영 건수 많은 순으로 탭 정렬 — '기타'는 항상 맨 뒤에 둔다(주 탐색 대상이 아니라서).
  const diseaseKeys = useMemo(() => {
    const keys = Object.keys(byDisease).filter(k => k !== OTHER_LABEL);
    keys.sort((a, b) => byDisease[b].length - byDisease[a].length);
    if (byDisease[OTHER_LABEL]) keys.push(OTHER_LABEL);
    return keys;
  }, [byDisease]);

  useEffect(() => {
    if (!activeDisease && diseaseKeys.length > 0) setActiveDisease(diseaseKeys[0]);
  }, [diseaseKeys, activeDisease]);

  const byChannel = useMemo(() => {
    const map = {};
    for (const r of validRows) {
      map[r.channel] ??= {};
      const p = (map[r.channel][r.program_name] ??= { count: 0, latest: null });
      p.count += 1;
      if (r.air_date && (!p.latest || r.air_date > p.latest)) p.latest = r.air_date;
    }
    const result = {};
    for (const ch of Object.keys(map)) {
      result[ch] = Object.entries(map[ch])
        .map(([program_name, v]) => ({ program_name, ...v }))
        .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    }
    return result;
  }, [validRows]);

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
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        각 채널에서 수집한 건강·생활·먹거리 프로그램의 다시보기 회차를 병명·증상별로 모았습니다.
        총 {validRows.length}건 회차 · {diseaseKeys.length - 1}개 병명 카테고리
        ('{OTHER_LABEL}' 제외) — 채널·프로그램은 각 회차의 부가 정보로만 표시됩니다.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setViewMode('disease')} style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #222', fontSize: 12.5, cursor: 'pointer',
          background: viewMode === 'disease' ? '#222' : '#fff', color: viewMode === 'disease' ? '#fff' : '#222',
        }}>🏷 병명별 보기</button>
        <button onClick={() => setViewMode('channel')} style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #222', fontSize: 12.5, cursor: 'pointer',
          background: viewMode === 'channel' ? '#222' : '#fff', color: viewMode === 'channel' ? '#fff' : '#222',
        }}>📺 채널별 보기</button>
      </div>

      {viewMode === 'disease' && (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {diseaseKeys.map(key => (
              <TabButton key={key} label={key} count={byDisease[key].length}
                active={activeDisease === key} onClick={() => setActiveDisease(key)} />
            ))}
            {diseaseKeys.length === 0 && <span style={{ color: '#888', fontSize: 13 }}>수집된 회차가 없습니다.</span>}
          </div>
          {activeDisease && <DiseaseTable episodes={byDisease[activeDisease] || []} />}
        </div>
      )}

      {viewMode === 'channel' && (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {channels.map(ch => (
              <TabButton key={ch} label={ch} count={byChannel[ch].length}
                active={activeChannel === ch} onClick={() => setActiveChannel(ch)} />
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
      )}
    </div>
  );
}
