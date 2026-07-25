import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DISEASE_DEFS, OTHER_LABEL } from '../lib/diseaseClassifier';

// 병명 탭 하나에 회차가 수백~1200건 넘게 몰리는 경우(비만·다이어트 1247, 고혈압 886, 암 728 등)가
// 있어서, 탭을 누를 때마다 전부 한 번에 테이블로 그리면 DOM 노드가 순식간에 수만 개로 불어나
// 탭 전환이 눈에 띄게 버벅였다. 그래서 처음엔 최신순으로 PAGE_SIZE개만 그리고, "더 보기"를
// 누를 때만 다음 묶음을 추가로 그리는 방식으로 바꿨다 — 데이터 자체(byDisease)는 그대로 전부
// 갖고 있고, 화면에 그리는 행 수만 점진적으로 늘리는 것이라 별도 서버 요청은 필요 없다.
const PAGE_SIZE = 100;

// 메모/이미지 업로드용 Storage 버킷(공개 버킷으로 미리 만들어둬야 함 — 아래 안내 참고).
const STORAGE_BUCKET = 'tvdb-episode-images';

// 화면 캡처로 찍은 이미지 파일명에 쓰는 타임스탬프 — pages/capture.js와 동일한 포맷.
function captureTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
const CAPTURE_HANDLE = 10;

// Supabase REST가 한 번에 내려주는 행 수를 서버 설정상 1000행으로 잘라버리기 때문에,
// tvdb_program_episodes 전체(9천여 건)를 다 훑으려면 끝까지 페이지네이션해야 한다.
// 최초 로드는 이제 pages/health.js의 getStaticProps(lib/loadHealthTree.js)가 서버에서
// 미리 받아 props로 내려주므로 이 함수는 "새로고침" 버튼(캐시 무시하고 즉시 최신화)에서만 쓰인다.
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

function infoRowsToMap(infoRows) {
  const map = new Map();
  (infoRows || []).forEach(i => map.set(`${i.channel}|${i.program_name}`, { replay_url: i.replay_url, has_replay: i.has_replay }));
  return map;
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
// (BroadcastPanel.js의 ConfirmModal과 동일한 패턴) — 채널별 보기 전용(프로그램 전체 삭제).
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

// 병명 탭에서 회차 하나를 통째로 지운다 — 채널별 보기의 ConfirmModal(프로그램 전체 등록정보 삭제)과
// 달리 여기는 tvdb_program_episodes의 개별 회차 행 자체를 지우는 것이라 별도 모달로 분리했다.
function EpisodeDeleteConfirm({ episode, onConfirm, onCancel, busy }) {
  if (!episode) return null;
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 420, width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>이 회차를 삭제할까요?</div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          [{episode.channel}] {episode.program_name} {episode.episode_no}회 — 이 회차 데이터를
          완전히 삭제합니다(되돌릴 수 없음, 프로그램 등록정보 자체는 그대로 남습니다).
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

// 회차 하나의 disease_tags를 직접 고쳐 넣는 모달. 분류기가 못 잡았거나(=기타로 빠졌거나)
// 잘못 잡은 경우를 수동으로 바로잡기 위함 — DISEASE_DEFS 라벨을 토글 버튼으로 보여주고
// 선택된 것만 배열로 저장한다(빈 배열이면 '기타'로 돌아감).
function CategoryEditModal({ episode, onSave, onClose, busy }) {
  const [selected, setSelected] = useState(new Set());
  const [newLabel, setNewLabel] = useState('');
  useEffect(() => {
    setSelected(new Set(episode?.disease_tags || []));
    setNewLabel('');
  }, [episode]);
  if (!episode) return null;
  function toggle(label) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }
  // DISEASE_DEFS(diseaseClassifier.js에 코드로 박혀있는 28개 고정 카테고리)에 없는 이름을
  // 직접 타이핑해서 추가하는 기능. 새로 추가한 라벨은 DISEASE_DEFS에 없어도 selected에는
  // 그대로 들어가고, 저장하면 disease_tags 배열에 문자열로 저장된다 — 병명 탭 목록(diseaseKeys)은
  // DISEASE_DEFS가 아니라 실제 데이터에 쓰인 disease_tags 값을 그대로 모아서 만들기 때문에
  // (HealthArchiveView의 byDisease 참고) 코드 수정/배포 없이도 저장 즉시 새 탭으로 나타난다.
  function addCustomLabel() {
    const label = newLabel.trim();
    if (!label) return;
    setSelected(prev => new Set(prev).add(label));
    setNewLabel('');
  }
  const customLabels = Array.from(selected).filter(label => !DISEASE_DEFS.some(d => d.label === label));
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 560, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>병명 카테고리 수정</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 2px' }}>[{episode.channel}] {episode.program_name} {episode.episode_no}회</p>
        <p style={{ fontSize: 12.5, color: '#444', marginBottom: 14 }}>{episode.content}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DISEASE_DEFS.map(d => (
            <button key={d.key} onClick={() => toggle(d.label)} style={{
              padding: '5px 11px', borderRadius: 999, border: '1px solid #ccc', fontSize: 12, cursor: 'pointer',
              background: selected.has(d.label) ? '#222' : '#fff', color: selected.has(d.label) ? '#fff' : '#222',
            }}>{d.label}</button>
          ))}
          {customLabels.map(label => (
            <button key={label} onClick={() => toggle(label)} style={{
              padding: '5px 11px', borderRadius: 999, border: '1px solid #7c3aed', fontSize: 12, cursor: 'pointer',
              background: '#7c3aed', color: '#fff',
            }}>{label} ✕</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }}
            placeholder="새 카테고리 이름 입력"
            style={{ flex: 1, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 12.5, fontFamily: 'inherit' }} />
          <button type="button" onClick={addCustomLabel} style={{
            flexShrink: 0, padding: '6px 14px', borderRadius: 6, border: '1px solid #7c3aed',
            background: '#f5f3ff', color: '#7c3aed', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}>+ 카테고리 추가</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* "+카테고리 추가" 버튼을 안 누르고 입력창에 이름만 쳐둔 채 바로 저장을 누르면 그 텍스트가
              selected에 한 번도 안 들어간 상태라 조용히 사라졌다 — 저장 시점에 남은 입력값을 합쳐서 보낸다. */}
          <button onClick={() => {
            const finalSet = new Set(selected);
            const trimmed = newLabel.trim();
            if (trimmed) finalSet.add(trimmed);
            onSave(Array.from(finalSet));
          }} disabled={busy} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #222', background: '#222',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>{busy ? '저장 중...' : '저장'}</button>
          <button type="button" onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff',
            color: '#222', fontSize: 13, cursor: 'pointer',
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// 회차 하나에 자유 메모 + 링크 여러 개 + 이미지 여러 장을 등록하는 모달. 이미지는 STORAGE_BUCKET
// (공개 버킷)에 업로드하고 공개 URL 배열만 tvdb_program_episodes.image_urls에 저장한다(파일
// 자체는 DB가 아니라 Storage에 있음). 기존에 저장돼있던 이미지는 keptUrls로 유지/개별 삭제하고,
// 새 이미지는 세 가지 방법으로 한꺼번에 슬롯에 추가할 수 있다: (1) "+ 이미지 추가" 버튼으로 여는
// multiple 파일 선택창에서 여러 장을 골라 한 번에, (2) 탐색기에서 이미지 여러 장을 그대로 드래그해
// 이미지 영역(점선 박스)에 드롭해서 한 번에, (3) "📸 화면 캡처로 추가" — pages/capture.js와 동일한
// getDisplayMedia+캔버스 크롭 로직을 이 모달 안에 그대로 넣어서, "바로가기"로 다시보기를 새 탭에서
// 재생해두고 돌아와 화면을 캡처하면 로컬에 PNG로 다운받았다가 파일 선택기로 다시 올리는 왕복 없이
// 캡처 결과가 바로 newSlots에 들어간다. 세 방법 모두 최종적으로 동일한 { file, preview } 모양이라
// 저장(handleSaveMemoImage) 쪽 로직은 손댈 필요가 없다.
function MemoImageModal({ episode, onSave, onClose, busy }) {
  const [memo, setMemo] = useState('');
  const [links, setLinks] = useState([]);
  const [keptUrls, setKeptUrls] = useState([]); // 기존에 저장돼있던 이미지 중 삭제 안 한 것
  const [newSlots, setNewSlots] = useState([]); // 새로 추가하는 이미지 슬롯 [{ file, preview }]
  const fileInputRef = useRef(null); // 숨겨둔 multiple 파일 입력 — "+ 이미지 추가" 버튼이 이걸 클릭시킨다
  const [dragOver, setDragOver] = useState(false); // 이미지 영역에 파일을 드래그해 올리는 중인지

  // 화면 캡처 단계: null(안 함) | 'sharing'(화면 공유 중, 재생 중인 영상 미리보기) |
  // 'captured'(프레임 한 장 캡처해서 영역 자르는 중) — capture.js의 상태 흐름과 동일하다.
  const [captureStep, setCaptureStep] = useState(null);
  const captureVideoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const captureStreamRef = useRef(null);
  const captureContainerRef = useRef(null);
  const [captureNaturalSize, setCaptureNaturalSize] = useState({ w: 0, h: 0 });
  const [captureDisplaySize, setCaptureDisplaySize] = useState({ w: 0, h: 0 });
  const [captureRect, setCaptureRect] = useState(null);
  const captureDragRef = useRef({ mode: null, origin: null, orig: null, start: null });

  useEffect(() => {
    setMemo(episode?.memo || '');
    setLinks(episode?.links && episode.links.length > 0 ? episode.links : []);
    setKeptUrls(episode?.image_urls && episode.image_urls.length > 0 ? episode.image_urls : []);
    setNewSlots([]);
    cancelCapture();
  }, [episode]);

  useEffect(() => () => captureStreamRef.current?.getTracks().forEach(t => t.stop()), []);

  if (!episode) return null;

  function addLink() {
    setLinks(ls => [...ls, '']);
  }
  function updateLink(idx, value) {
    setLinks(ls => ls.map((l, i) => (i === idx ? value : l)));
  }
  function removeLink(idx) {
    setLinks(ls => ls.filter((_, i) => i !== idx));
  }

  function removeKeptUrl(idx) {
    setKeptUrls(us => us.filter((_, i) => i !== idx));
  }
  // 여러 장을 한꺼번에 받는다 — "+ 이미지 추가" 버튼으로 여는 파일 선택창에서 여러 장을 골라도,
  // 탐색기에서 여러 장을 드래그해서 이 모달 위에 통째로 놓아도 전부 이 함수를 거쳐 newSlots에
  // 한 번에 추가된다(이미지가 아닌 파일은 조용히 걸러낸다).
  function addImageFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.type.startsWith('image/'));
    if (files.length === 0) return;
    setNewSlots(s => [...s, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
  }
  function removeImageSlot(idx) {
    setNewSlots(s => s.filter((_, i) => i !== idx));
  }

  async function startCapture() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
      captureStreamRef.current = stream;
      captureVideoRef.current.srcObject = stream;
      await captureVideoRef.current.play();
      setCaptureStep('sharing');
      stream.getVideoTracks()[0].addEventListener('ended', cancelCapture);
    } catch (e) {
      alert('화면 공유를 시작하지 못했습니다: ' + e.message);
    }
  }

  function cancelCapture() {
    captureStreamRef.current?.getTracks().forEach(t => t.stop());
    captureStreamRef.current = null;
    setCaptureStep(null);
    setCaptureRect(null);
  }

  function captureFrame() {
    const video = captureVideoRef.current;
    const w = video.videoWidth, h = video.videoHeight;
    const canvas = captureCanvasRef.current;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const maxW = Math.min(560, window.innerWidth - 96);
    const scale = Math.min(1, maxW / w);
    setCaptureNaturalSize({ w, h });
    setCaptureDisplaySize({ w: Math.round(w * scale), h: Math.round(h * scale) });
    setCaptureRect(null);
    setCaptureStep('captured');
  }

  function retakeCapture() {
    setCaptureStep('sharing');
    setCaptureRect(null);
  }

  function hitTest(x, y, r) {
    if (!r) return null;
    const { x1, y1, x2, y2 } = r;
    const positions = {
      nw: [x1, y1], n: [(x1 + x2) / 2, y1], ne: [x2, y1],
      w: [x1, (y1 + y2) / 2], e: [x2, (y1 + y2) / 2],
      sw: [x1, y2], s: [(x1 + x2) / 2, y2], se: [x2, y2],
    };
    for (const [name, [hx, hy]] of Object.entries(positions)) {
      if (Math.abs(x - hx) <= CAPTURE_HANDLE && Math.abs(y - hy) <= CAPTURE_HANDLE) return name;
    }
    if (x1 < x && x < x2 && y1 < y && y < y2) return 'move';
    return null;
  }
  function getCapturePos(e) {
    const box = captureContainerRef.current.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }
  function onCapturePointerDown(e) {
    const { x, y } = getCapturePos(e);
    const hit = hitTest(x, y, captureRect);
    if (!captureRect || !hit) {
      captureDragRef.current = { mode: 'new', start: { x, y } };
      setCaptureRect({ x1: x, y1: y, x2: x, y2: y });
    } else {
      captureDragRef.current = { mode: hit, origin: { x, y }, orig: captureRect };
    }
    e.target.setPointerCapture?.(e.pointerId);
  }
  function onCapturePointerMove(e) {
    const d = captureDragRef.current;
    if (!d.mode) return;
    const { x, y } = getCapturePos(e);
    if (d.mode === 'new') {
      const { x: sx, y: sy } = d.start;
      setCaptureRect({ x1: Math.min(sx, x), y1: Math.min(sy, y), x2: Math.max(sx, x), y2: Math.max(sy, y) });
    } else if (d.mode === 'move') {
      const dx = x - d.origin.x, dy = y - d.origin.y;
      const { x1, y1, x2, y2 } = d.orig;
      setCaptureRect({ x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy });
    } else {
      let { x1, y1, x2, y2 } = d.orig;
      const dx = x - d.origin.x, dy = y - d.origin.y;
      if (d.mode.includes('n')) y1 += dy;
      if (d.mode.includes('s')) y2 += dy;
      if (d.mode.includes('w')) x1 += dx;
      if (d.mode.includes('e')) x2 += dx;
      setCaptureRect({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
    }
  }
  function onCapturePointerUp() {
    captureDragRef.current = { mode: null };
  }

  // 선택 영역(또는 영역을 안 골랐으면 전체 화면)을 잘라서 곧바로 newSlots에 추가하고 캡처 모드를
  // 닫는다 — 여기서 만든 File은 기존 "+ 이미지 추가"로 고른 파일과 완전히 같은 모양이라 저장 시
  // 똑같이 업로드된다.
  function useCaptured(useRegion) {
    const canvas = captureCanvasRef.current;
    let sourceCanvas = canvas;
    if (useRegion) {
      if (!captureRect || Math.abs(captureRect.x2 - captureRect.x1) < 5 || Math.abs(captureRect.y2 - captureRect.y1) < 5) {
        alert('먼저 영역을 드래그로 선택해주세요.');
        return;
      }
      const scaleX = captureNaturalSize.w / captureDisplaySize.w;
      const scaleY = captureNaturalSize.h / captureDisplaySize.h;
      const sx = Math.round(captureRect.x1 * scaleX), sy = Math.round(captureRect.y1 * scaleY);
      const sw = Math.round((captureRect.x2 - captureRect.x1) * scaleX), sh = Math.round((captureRect.y2 - captureRect.y1) * scaleY);
      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      sourceCanvas = out;
    }
    sourceCanvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `capture_${captureTimestamp()}.png`, { type: 'image/png' });
      setNewSlots(s => [...s, { file, preview: URL.createObjectURL(file) }]);
      cancelCapture();
    }, 'image/png');
  }

  const modalMaxWidth = captureStep ? 640 : 480;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: modalMaxWidth, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>메모 · 이미지</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 14px' }}>[{episode.channel}] {episode.program_name} {episode.episode_no}회</p>

        {captureStep && (
          <div style={{ marginBottom: 18, padding: 12, border: '1px dashed #ccc', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>📸 화면 캡처</span>
              <button type="button" onClick={cancelCapture} style={{ border: 'none', background: 'none', fontSize: 12.5, color: '#888', cursor: 'pointer' }}>취소</button>
            </div>

            {captureStep === 'sharing' && (
              <div>
                <video ref={captureVideoRef} muted style={{ width: '100%', maxWidth: 560, borderRadius: 8, background: '#000', display: 'block' }} />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button type="button" onClick={captureFrame} style={captureBtnPrimary}>캡처(현재 프레임)</button>
                </div>
              </div>
            )}

            {captureStep === 'captured' && (
              <div>
                <div ref={captureContainerRef}
                  onPointerDown={onCapturePointerDown} onPointerMove={onCapturePointerMove} onPointerUp={onCapturePointerUp}
                  style={{ position: 'relative', width: captureDisplaySize.w, height: captureDisplaySize.h, cursor: 'crosshair', touchAction: 'none' }}>
                  <canvas ref={captureCanvasRef} style={{ width: captureDisplaySize.w, height: captureDisplaySize.h, borderRadius: 8, display: 'block' }} />
                  {captureRect && (
                    <>
                      <div style={{
                        position: 'absolute', left: captureRect.x1, top: captureRect.y1,
                        width: captureRect.x2 - captureRect.x1, height: captureRect.y2 - captureRect.y1,
                        border: '2px dashed #00c853', background: 'rgba(0,200,83,0.12)', boxSizing: 'border-box',
                      }} />
                      {[
                        [captureRect.x1, captureRect.y1], [(captureRect.x1 + captureRect.x2) / 2, captureRect.y1], [captureRect.x2, captureRect.y1],
                        [captureRect.x1, (captureRect.y1 + captureRect.y2) / 2], [captureRect.x2, (captureRect.y1 + captureRect.y2) / 2],
                        [captureRect.x1, captureRect.y2], [(captureRect.x1 + captureRect.x2) / 2, captureRect.y2], [captureRect.x2, captureRect.y2],
                      ].map(([hx, hy], i) => (
                        <div key={i} style={{
                          position: 'absolute', left: hx - CAPTURE_HANDLE / 2, top: hy - CAPTURE_HANDLE / 2,
                          width: CAPTURE_HANDLE, height: CAPTURE_HANDLE, background: '#00c853', border: '2px solid #fff',
                          borderRadius: 2, boxShadow: '0 0 2px rgba(0,0,0,0.5)',
                        }} />
                      ))}
                    </>
                  )}
                </div>
                <p style={{ fontSize: 11.5, color: '#888', margin: '8px 0' }}>드래그로 영역을 선택하세요. 선택 없이 전체 화면 그대로 추가할 수도 있어요.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => useCaptured(true)} style={captureBtnPrimary}>선택 영역 추가</button>
                  <button type="button" onClick={() => useCaptured(false)} style={captureBtnSecondary}>전체 화면 추가</button>
                  <button type="button" onClick={retakeCapture} style={captureBtnSecondary}>다시 캡처</button>
                </div>
              </div>
            )}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>메모</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={4} placeholder="자유롭게 메모를 남겨주세요"
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 16 }} />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>링크</label>
        <div style={{ marginBottom: 8 }}>
          {links.map((link, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={link} onChange={e => updateLink(idx, e.target.value)} placeholder="https://..."
                style={{ flex: 1, boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #ccc', fontSize: 13, fontFamily: 'inherit' }} />
              <button type="button" onClick={() => removeLink(idx)} title="이 링크 삭제" style={{
                flexShrink: 0, padding: '0 12px', borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', fontSize: 14, cursor: 'pointer',
              }}>−</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLink} style={{
          marginBottom: 18, padding: '4px 12px', fontSize: 12.5, borderRadius: 6, border: '1px solid #ccc',
          background: '#fff', color: '#222', cursor: 'pointer',
        }}>+ 링크 추가</button>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>이미지</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={e => { addImageFiles(e.target.files); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addImageFiles(e.dataTransfer.files); }}
          style={{
            marginBottom: 8, padding: 8, borderRadius: 8,
            border: dragOver ? '2px dashed #2563eb' : '2px dashed #ddd',
            background: dragOver ? '#eff6ff' : 'transparent',
          }}
        >
          {keptUrls.map((url, idx) => (
            <div key={`kept-${idx}`} style={{ marginBottom: 8 }}>
              <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => removeKeptUrl(idx)} style={{
                marginTop: 6, padding: '3px 9px', fontSize: 11.5, borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', cursor: 'pointer',
              }}>이미지 삭제</button>
            </div>
          ))}
          {newSlots.map((slot, idx) => (
            <div key={`new-${idx}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8 }}>
              <img src={slot.preview} alt="" style={{ flex: 1, maxWidth: '100%', maxHeight: 180, borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => removeImageSlot(idx)} title="이 이미지 취소" style={{
                flexShrink: 0, padding: '0 12px', borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', fontSize: 14, cursor: 'pointer',
              }}>−</button>
            </div>
          ))}
          {keptUrls.length === 0 && newSlots.length === 0 && (
            <p style={{ margin: 0, padding: '10px 0', fontSize: 12, color: '#999', textAlign: 'center' }}>
              여기로 이미지 파일을 여러 장 한꺼번에 드래그해서 놓을 수 있어요
            </p>
          )}
        </div>
        <div style={{ marginBottom: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{
            padding: '4px 12px', fontSize: 12.5, borderRadius: 6, border: '1px solid #ccc',
            background: '#fff', color: '#222', cursor: 'pointer',
          }}>+ 이미지 추가</button>
          {!captureStep && (
            <button type="button" onClick={startCapture} style={{
              padding: '4px 12px', fontSize: 12.5, borderRadius: 6, border: '1px solid #93c5fd',
              background: '#eff6ff', color: '#2563eb', cursor: 'pointer',
            }}>📸 화면 캡처로 추가</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSave({
            memo,
            links: links.map(l => l.trim()).filter(Boolean),
            keptUrls,
            newFiles: newSlots.map(s => s.file).filter(Boolean),
          })} disabled={busy} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #222', background: '#222',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>{busy ? '저장 중...' : '저장'}</button>
          <button type="button" onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff',
            color: '#222', fontSize: 13, cursor: 'pointer',
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

const captureBtnPrimary = {
  padding: '7px 14px', borderRadius: 6, border: '1px solid #222', background: '#222',
  color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};
const captureBtnSecondary = {
  padding: '7px 14px', borderRadius: 6, border: '1px solid #ccc', background: '#fff',
  color: '#222', fontSize: 12.5, cursor: 'pointer',
};

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

const actionBtnStyle = {
  padding: '3px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #ccc',
  background: '#fff', color: '#222', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
};

// 병명 탭 안의 회차 한 줄. 프로그램 단위로만 알던 다시보기 링크(info.replay_url)를 회차 행에서도
// 바로 열 수 있게 하고, 분류를 잘못 잡았거나 '기타'로 빠진 회차를 그 자리에서 수정/삭제할 수 있게
// 관리 버튼 3개(바로가기/분류수정/삭제)를 붙였다 — 채널별 보기의 삭제(askDelete)와는 별개로
// 여기는 회차 단위 삭제/수정이다.
// 블로그 소재로 이미 썼는지/영상을 사람이 직접 확인했는지는 분류(disease_tags)와 별개로
// 진행 상황을 체크하는 용도라서 회차 행마다 즉시 토글되는 체크박스로 둔다 — 삭제/분류수정과
// 달리 확인 모달 없이 클릭 한 번으로 바로 저장한다(자주 반복하는 단순 체크 작업이라서).
function StatusCheckbox({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#444', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={!!checked} onChange={onChange} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  );
}

// 회차 번호(#id)를 클릭 한 번으로 복사할 수 있는 완성된 작업지침으로 바꿔주는 버튼.
// 이 대화 맥락을 모르는 다른 클로드 세션에 그대로 붙여넣어도 알아듣도록, "TVDB MCP를 쓸 것"
// "get_system_prompt/tvdb_channel_notes부터 확인할 것"까지 명시한다 — ffmpeg 캡처 자체는
// 서버(Vercel)에서 못 돌리므로(83MB 용량 제한) 이 지침을 받은 클로드가 자기 Bash로 직접
// 돌리는 구조는 그대로 필요하다(2026-07-26 확인).
function buildCaptureInstruction(ep) {
  const category = (ep.disease_tags && ep.disease_tags.length > 0) ? ep.disease_tags.join(', ') : '기타';
  return `[TVDB] 회차 #${ep.id} 블로그 스샷 작업 요청

1. TVDB MCP 서버에 연결해서 get_system_prompt로 최신 방법론부터 확인할 것
2. get_rows로 tvdb_program_episodes에서 id=${ep.id} 조회 (${ep.channel} ${ep.program_name} ${ep.episode_no}회, 병명 카테고리: ${category})
3. 그 회차의 다시보기/클립 링크(위 조회 결과의 links, 필요하면 tvdb_program_info.replay_url)에서 채널별 추출 방법을 tvdb_channel_notes에서 확인
4. 링크를 열어(또는 스트림 URL 찾아서) ffmpeg로 "${category}" 블로그 소재에 쓸 장면을 캡처 — Bash 도구로 직접 실행
5. Downloads에 새 폴더 만들어서 캡처한 이미지를 저장하고 전달할 것`;
}

function EpisodeRow({ ep, info, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified, onToggleClipVerified }) {
  const canWatch = info?.has_replay && info?.replay_url;
  const [copied, setCopied] = useState(false);
  function copyInstruction() {
    navigator.clipboard.writeText(buildCaptureInstruction(ep)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '6px', color: '#aaa', whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 11.5 }}>
        #{ep.id}
        <button onClick={copyInstruction} title="이 회차 작업지침 복사" style={{
          display: 'block', marginTop: 4, padding: '2px 6px', fontSize: 10.5, borderRadius: 4,
          border: '1px solid #ccc', background: copied ? '#dcfce7' : '#fff',
          color: copied ? '#16a34a' : '#888', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{copied ? '✓ 복사됨' : '📋 지침 복사'}</button>
      </td>
      <td style={{ padding: '6px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.air_date || '-'}</td>
      <td style={{ padding: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.channel}</td>
      <td style={{ padding: '6px', verticalAlign: 'top', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ep.program_name}<span style={{ color: '#aaa' }}> {ep.episode_no}회</span></td>
      <td style={{ padding: '6px' }}>
        {ep.content}
        {ep.memo && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: '#7c5c00', background: '#fff8e1', borderRadius: 4, padding: '3px 6px' }}>
            📝 {ep.memo}
          </div>
        )}
      </td>
      <td style={{ padding: '6px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <StatusCheckbox checked={ep.blog_used} onChange={() => onToggleBlogUsed(ep)} label="블로그" />
          <StatusCheckbox checked={ep.video_verified} onChange={() => onToggleVideoVerified(ep)} label="영상" />
          {ep.links && ep.links.length > 0 && (
            <StatusCheckbox checked={ep.clip_verified} onChange={() => onToggleClipVerified(ep)} label="클립확인" />
          )}
        </div>
      </td>
      <td style={{ padding: '6px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {canWatch ? (
            <a href={info.replay_url} target="_blank" rel="noreferrer" style={{ ...actionBtnStyle, borderColor: '#93c5fd', color: '#2563eb' }}>▶ 다시보기</a>
          ) : (
            <span style={{ ...actionBtnStyle, color: '#bbb', cursor: 'default' }}>다시보기 없음</span>
          )}
          {ep.links && ep.links.map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noreferrer" style={{ ...actionBtnStyle, borderColor: '#c4b5fd', color: '#7c3aed' }}>🎬 클립{i + 1}</a>
          ))}
          <button onClick={() => onEdit(ep)} style={actionBtnStyle}>분류수정</button>
          <button onClick={() => onEditMemo(ep)} style={actionBtnStyle}>📝 메모·이미지</button>
          <button onClick={() => onDelete(ep)} style={{ ...actionBtnStyle, borderColor: '#fecaca', color: '#dc2626' }}>삭제</button>
        </div>
      </td>
    </tr>
  );
}

// 병명 탭 안에서는 채널·프로그램 구분 없이 모든 회차를 방영일 최신순으로 한 줄씩 보여준다.
// (사용자가 실제로 원하는 건 "이 병명에 뭐가 있나"이지 "어느 채널이 뭘 방송했나"가 아니라서,
// 채널/프로그램은 각 행의 부가 정보로만 남긴다 — 2026-07-25 인계 메모 참고.)
// episodes는 이미 호출부(HealthArchiveView)에서 PAGE_SIZE만큼 잘라서 넘어온다 — 여기서는
// 받은 것만 그대로 그린다.
function DiseaseTable({ episodes, infoMap, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified, onToggleClipVerified }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #222', color: '#888' }}>
          <th style={{ padding: '6px', width: 60 }}>번호</th>
          <th style={{ padding: '6px', width: 90 }}>방영일</th>
          <th style={{ padding: '6px', width: 70 }}>채널</th>
          <th style={{ padding: '6px', width: 160 }}>프로그램</th>
          <th style={{ padding: '6px' }}>내용</th>
          <th style={{ padding: '6px', width: 90 }}>상태</th>
          <th style={{ padding: '6px', width: 250 }}>관리</th>
        </tr>
      </thead>
      <tbody>
        {episodes.map(ep => (
          <EpisodeRow key={ep.id} ep={ep} info={infoMap?.get(`${ep.channel}|${ep.program_name}`)}
            onEdit={onEdit} onDelete={onDelete} onEditMemo={onEditMemo}
            onToggleBlogUsed={onToggleBlogUsed} onToggleVideoVerified={onToggleVideoVerified}
            onToggleClipVerified={onToggleClipVerified} />
        ))}
        {episodes.length === 0 && (
          <tr><td colSpan={7} style={{ padding: 16, color: '#888' }}>해당 병명으로 분류된 회차가 없습니다.</td></tr>
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
//
// initialRows/initialInfoRows는 pages/health.js의 getStaticProps(lib/loadHealthTree.js)가
// 서버에서 미리 걸러서 내려준 것(=이미 valid, 이미 disease_tags 백필됨)이라 마운트 시 별도
// 네트워크 요청이 필요 없다. 삭제/분류수정/체크박스 조작은 그대로 클라이언트에서 즉시 반영하고,
// "새로고침" 버튼을 누르면 fetchAllPages로 캐시(ISR 스냅샷)를 건너뛰고 최신 상태를 다시 받는다.
export default function HealthArchiveView({ initialRows, initialInfoRows, generatedAt }) {
  const [rows, setRows] = useState(initialRows || []);
  const [infoMap, setInfoMap] = useState(() => infoRowsToMap(initialInfoRows));
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(generatedAt ? new Date(generatedAt) : null);

  // 기본 화면은 병명별 보기. 채널별 보기는 예전 화면을 그대로 보조 탭으로 남겨둔 것
  // (2026-07-25 사용자 확인: 완전 삭제 대신 보조 탭 유지).
  const [viewMode, setViewMode] = useState('disease'); // 'disease' | 'channel'

  const [activeDisease, setActiveDisease] = useState('');
  const [activeChannel, setActiveChannel] = useState('');

  // 병명 탭 하나에 몰린 회차를 한 번에 다 그리면 탭 전환이 느려져서(최대 1247건), 처음엔
  // PAGE_SIZE개(최신순)만 그리고 "더 보기"로 점진적으로 늘린다. 탭을 바꾸면 다시 처음부터.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [opened, setOpened] = useState(null); // { channel, program_name } — 채널별 보기 전용
  const [episodes, setEpisodes] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [editingEp, setEditingEp] = useState(null); // 병명 탭 — 분류수정 대상 회차
  const [editBusy, setEditBusy] = useState(false);
  const [epConfirm, setEpConfirm] = useState(null); // 병명 탭 — 삭제 확인 대상 회차
  const [epConfirmBusy, setEpConfirmBusy] = useState(false);

  const [memoEp, setMemoEp] = useState(null); // 병명 탭 — 메모·이미지 수정 대상 회차
  const [memoBusy, setMemoBusy] = useState(false);

  // ISR 스냅샷이 최대 10분 묵을 수 있어서, 다른 세션(관리자 화면, 수집 스크립트, 다른 방문자의
  // 편집)이 그 사이 바꾼 내용까지 지금 보고 싶을 때 누르는 수동 새로고침.
  async function handleRefresh() {
    setRefreshing(true);
    const [episodeRows, infoRows] = await Promise.all([
      fetchAllPages('tvdb_program_episodes', 'id, channel, program_name, episode_no, air_date, content, disease_tags, blog_used, video_verified, clip_verified, memo, image_urls, links'),
      fetchAllPages('tvdb_program_info', 'channel, program_name, replay_url, has_replay'),
    ]);
    const map = infoRowsToMap(infoRows);
    const validEpisodes = episodeRows.filter(r => r.channel && r.program_name && map.has(`${r.channel}|${r.program_name}`));
    setRows(validEpisodes);
    setInfoMap(map);
    setLastUpdated(new Date());
    setRefreshing(false);
  }

  const byDisease = useMemo(() => {
    const map = {};
    const other = [];
    for (const r of rows) {
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
  }, [rows]);

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

  // 병명 탭을 바꿀 때마다 다시 최신 PAGE_SIZE건부터 보여준다(이전 탭에서 눌러둔 "더 보기"가
  // 다음 탭까지 이어지지 않도록).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeDisease]);

  const byChannel = useMemo(() => {
    const map = {};
    for (const r of rows) {
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
  }, [rows]);

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
  // 동작이라, 여기서 지우면 관리자에도 반영되고 관리자에서 지운 것도 다음 ISR 재생성 때 반영된다.
  // 이 화면(현재 세션)은 rows에서도 바로 걸러내서 즉시 사라지게 한다.
  async function handleConfirmDelete() {
    if (!confirm) return;
    setConfirmBusy(true);
    const { error } = await supabase.from('tvdb_program_info').delete()
      .eq('channel', confirm.channel).eq('program_name', confirm.program_name);
    setConfirmBusy(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    const nextInfoMap = new Map(infoMap);
    nextInfoMap.delete(`${confirm.channel}|${confirm.program_name}`);
    setInfoMap(nextInfoMap);
    setRows(prev => prev.filter(r => !(r.channel === confirm.channel && r.program_name === confirm.program_name)));
    if (opened && opened.channel === confirm.channel && opened.program_name === confirm.program_name) {
      setOpened(null);
    }
    setConfirm(null);
  }

  // 병명 탭 — 회차 하나의 disease_tags를 직접 고쳐 저장. rows 안의 해당 행만 갱신하면
  // byDisease가 자동으로 다시 계산되어 탭 소속이 즉시 반영된다.
  async function handleSaveCategories(newLabels) {
    if (!editingEp) return;
    setEditBusy(true);
    const disease_tags = newLabels.length > 0 ? newLabels : null;
    const { error } = await supabase.from('tvdb_program_episodes').update({ disease_tags }).eq('id', editingEp.id);
    setEditBusy(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === editingEp.id ? { ...r, disease_tags } : r)));
    setEditingEp(null);
  }

  // 병명 탭 — 회차 자체를 삭제(원본 수집 데이터 오류 등). 채널별 보기의 프로그램 삭제와 달리
  // tvdb_program_episodes 행 하나만 지운다(tvdb_program_info는 건드리지 않음).
  async function handleConfirmDeleteEpisode() {
    if (!epConfirm) return;
    setEpConfirmBusy(true);
    const { error } = await supabase.from('tvdb_program_episodes').delete().eq('id', epConfirm.id);
    setEpConfirmBusy(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    setRows(prev => prev.filter(r => r.id !== epConfirm.id));
    setEpConfirm(null);
  }

  // 병명 탭 — 메모/링크/이미지 저장. 새로 고른 이미지 파일들을 먼저 Storage에 전부 올리고, 남겨둔
  // 기존 URL(keptUrls)과 합쳐서 image_urls 배열로 한 번에 UPDATE한다. 파일마다 경로를 겹치지
  // 않게(episode.id-타임스탬프-인덱스.확장자) 만들어서 여러 장을 한 번에 올려도 서로 덮어쓰지 않는다.
  // 원본 파일명은 절대 경로에 넣지 않는다 — 한글/공백/특수문자가 섞인 파일명(예: 스크린샷 캡처
  // 파일명)을 그대로 Storage 키에 넣으면 "Invalid key" 오류로 업로드가 실패하기 때문(실제 발생 사례:
  // 한글로 이름 붙인 캡처 이미지 업로드 실패). 확장자만 안전하게 뽑아 쓰고 나머지는 버린다.
  // 이미지를 전부 지웠으면 image_urls를 null로 되돌린다(링크도 동일 규칙).
  async function handleSaveMemoImage({ memo, links, keptUrls, newFiles }) {
    if (!memoEp) return;
    setMemoBusy(true);
    const uploadedUrls = [];
    const ts = Date.now();
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      const ext = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg').toLowerCase();
      const path = `${memoEp.id}-${ts}-${i}${ext}`;
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
      if (uploadError) {
        setMemoBusy(false);
        alert('이미지 업로드 실패: ' + uploadError.message);
        return;
      }
      uploadedUrls.push(supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    }
    const combinedUrls = [...keptUrls, ...uploadedUrls];
    const image_urls = combinedUrls.length > 0 ? combinedUrls : null;
    const memoValue = memo?.trim() ? memo.trim() : null;
    const linksValue = links && links.length > 0 ? links : null;
    const { error } = await supabase.from('tvdb_program_episodes').update({ memo: memoValue, image_urls, links: linksValue }).eq('id', memoEp.id);
    setMemoBusy(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === memoEp.id ? { ...r, memo: memoValue, image_urls, links: linksValue } : r)));
    setMemoEp(null);
  }

  async function handleToggleBlogUsed(ep) {
    const blog_used = !ep.blog_used;
    const { error } = await supabase.from('tvdb_program_episodes').update({ blog_used }).eq('id', ep.id);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === ep.id ? { ...r, blog_used } : r)));
  }

  async function handleToggleVideoVerified(ep) {
    const video_verified = !ep.video_verified;
    const { error } = await supabase.from('tvdb_program_episodes').update({ video_verified }).eq('id', ep.id);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === ep.id ? { ...r, video_verified } : r)));
  }

  // 클립확인 = 링크는 이미 있지만(자동/수동으로 찾아 넣은 클립 URL), 그 링크를 실제로 사람이
  // 열어서 화면캡처하기 좋은 내용인지 직접 확인했는지 추적하는 용도 — video_verified와 같은 성격.
  async function handleToggleClipVerified(ep) {
    const clip_verified = !ep.clip_verified;
    const { error } = await supabase.from('tvdb_program_episodes').update({ clip_verified }).eq('id', ep.id);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === ep.id ? { ...r, clip_verified } : r)));
  }

  const programs = byChannel[activeChannel] || [];
  const activeDiseaseEpisodes = byDisease[activeDisease] || [];
  const visibleDiseaseEpisodes = activeDiseaseEpisodes.slice(0, visibleCount);

  return (
    <div>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        각 채널에서 수집한 건강·생활·먹거리 프로그램의 다시보기 회차를 병명·증상별로 모았습니다.
        총 {rows.length}건 회차 · {diseaseKeys.length - 1}개 병명 카테고리
        ('{OTHER_LABEL}' 제외) — 채널·프로그램은 각 회차의 부가 정보로만 표시됩니다.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setViewMode('disease')} style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #222', fontSize: 12.5, cursor: 'pointer',
          background: viewMode === 'disease' ? '#222' : '#fff', color: viewMode === 'disease' ? '#fff' : '#222',
        }}>🏷 병명별 보기</button>
        <button onClick={() => setViewMode('channel')} style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #222', fontSize: 12.5, cursor: 'pointer',
          background: viewMode === 'channel' ? '#222' : '#fff', color: viewMode === 'channel' ? '#fff' : '#222',
        }}>📺 채널별 보기</button>
        <button onClick={handleRefresh} disabled={refreshing} style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #ccc', fontSize: 12.5, cursor: 'pointer',
          background: '#fff', color: '#444', opacity: refreshing ? 0.6 : 1,
        }}>{refreshing ? '새로고침 중...' : '🔄 새로고침'}</button>
        {lastUpdated && (
          <span style={{ fontSize: 11.5, color: '#999' }}>
            마지막 갱신 {lastUpdated.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
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
          {activeDisease && (
            <>
              <DiseaseTable
                episodes={visibleDiseaseEpisodes}
                infoMap={infoMap}
                onEdit={setEditingEp}
                onDelete={setEpConfirm}
                onEditMemo={setMemoEp}
                onToggleBlogUsed={handleToggleBlogUsed}
                onToggleVideoVerified={handleToggleVideoVerified}
                onToggleClipVerified={handleToggleClipVerified}
              />
              {activeDiseaseEpisodes.length > visibleDiseaseEpisodes.length && (
                <div style={{ textAlign: 'center', margin: '14px 0' }}>
                  <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} style={{
                    padding: '8px 20px', borderRadius: 999, border: '1px solid #ccc', background: '#fff',
                    color: '#222', fontSize: 13, cursor: 'pointer',
                  }}>
                    더 보기 ({activeDiseaseEpisodes.length - visibleDiseaseEpisodes.length}건 남음)
                  </button>
                </div>
              )}
            </>
          )}
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

      <CategoryEditModal episode={editingEp} onSave={handleSaveCategories} onClose={() => setEditingEp(null)} busy={editBusy} />
      <EpisodeDeleteConfirm episode={epConfirm} onConfirm={handleConfirmDeleteEpisode} onCancel={() => setEpConfirm(null)} busy={epConfirmBusy} />
      <MemoImageModal episode={memoEp} onSave={handleSaveMemoImage} onClose={() => setMemoEp(null)} busy={memoBusy} />
    </div>
  );
}
