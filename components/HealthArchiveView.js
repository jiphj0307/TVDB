import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
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
    // image_urls 안에 완전히 같은 URL이 두 번 이상 들어있는 경우가 실제로 있었다(아래
    // captureShot의 키보드 연타 레이스 컨디션 참고) — 중복이 그대로 있으면 사용자가 "이미지
    // 삭제"를 눌러 하나를 지워도 나머지 중복이 남아있어 "삭제해도 그대로다"로 보인다. 여기서
    // 먼저 중복 제거해 보여주면, 한 번 지우고 저장했을 때 그 URL이 실제로 완전히 사라진다.
    setKeptUrls(episode?.image_urls ? Array.from(new Set(episode.image_urls)) : []);
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

  // 이미지를 2열 그리드로 보여주려고 모달 자체를 더 넓혔다(480 -> 760) — 캡처 단계는 원래
  // 화면 공유 미리보기 크기에 맞춰져 있어 그대로 640 유지.
  const modalMaxWidth = captureStep ? 640 : 760;

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
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          }}
        >
          {keptUrls.map((url, idx) => (
            <div key={`kept-${idx}`}>
              <img src={url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => removeKeptUrl(idx)} style={{
                marginTop: 6, padding: '3px 9px', fontSize: 11.5, borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', cursor: 'pointer',
              }}>이미지 삭제</button>
            </div>
          ))}
          {newSlots.map((slot, idx) => (
            <div key={`new-${idx}`}>
              <img src={slot.preview} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => removeImageSlot(idx)} title="이 이미지 취소" style={{
                marginTop: 6, padding: '3px 9px', fontSize: 11.5, borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff', color: '#dc2626', cursor: 'pointer',
              }}>이미지 취소</button>
            </div>
          ))}
          {keptUrls.length === 0 && newSlots.length === 0 && (
            <p style={{ gridColumn: '1 / -1', margin: 0, padding: '10px 0', fontSize: 12, color: '#999', textAlign: 'center' }}>
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

// "🎬 클립N" 버튼으로 여는 모달 — tvchosun.com 클립 페이지를 그대로 iframe에 못 넣는다
// (그 페이지가 X-Frame-Options: SAMEORIGIN이라 브라우저가 막음). 그래서 서버 API
// (pages/api/resolve-stream.js)가 그 페이지를 대신 fetch해서 실제 재생 스트림(m3u8) 주소만
// 뽑아 돌려주면, 그 주소를 hls.js로 우리 쪽 <video>에 직접 물려서 재생한다. hls.js는 레포에
// 새 npm 의존성을 안 늘리려고 CDN에서 그때그때 불러온다(이미 로드돼있으면 재사용).
let hlsJsPromise = null;
function ensureHlsJs() {
  if (window.Hls) return Promise.resolve();
  if (hlsJsPromise) return hlsJsPromise;
  hlsJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('hls.js 로드 실패'));
    document.head.appendChild(script);
  });
  return hlsJsPromise;
}

function ClipPlayerModal({ clip, onClose, onImageAdded }) {
  const url = clip?.url;
  const ep = clip?.ep;
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | error
  const [errorMsg, setErrorMsg] = useState('');
  const [shotState, setShotState] = useState('idle'); // idle | saving | saved
  // captureShot 재진입 방지용. state(shotState)만으로 막으면 setShotState가 비동기라, 'S'키를
  // OS 자동反복으로 아주 빠르게 두 번 눌렀을 때 두 호출 다 setShotState('saving')이 반영되기
  // 전에 가드를 통과해버린다 — 실제로 이 회차(#4248) DB에 타임스탬프가 완전히 같은 캡처 URL이
  // 중복 저장돼 있던 걸 확인함(2026-07-26). ref는 대입이 동기적이라 이 경합을 막는다.
  const capturingRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    setStatus('loading');
    setErrorMsg('');
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/resolve-stream?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.src) throw new Error(data.error || '스트림 주소를 찾지 못했습니다');

        await ensureHlsJs();
        if (cancelled) return;

        const video = videoRef.current;
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls();
          hlsRef.current = hls;
          hls.loadSource(data.src);
          hls.attachMedia(video);
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) { setStatus('playing'); video.play().catch(() => {}); }
          });
          hls.on(window.Hls.Events.ERROR, (_e, d) => {
            if (d.fatal && !cancelled) { setStatus('error'); setErrorMsg('재생 중 오류가 발생했습니다'); }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = data.src;
          setStatus('playing');
          video.play().catch(() => {});
        } else {
          throw new Error('이 브라우저는 HLS 재생을 지원하지 않습니다');
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setErrorMsg(e.message); }
      }
    }
    load();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load(); }
    };
  }, [url]);

  // 현재 재생 프레임을 캔버스로 그려서 그대로 Storage에 올리고, 그 회차 image_urls에 이어붙인다
  // (기존 메모·이미지 모달의 handleSaveMemoImage와 같은 버킷/경로 규칙 — 파일명에 원본 이름을
  // 안 쓰는 이유도 동일: 한글/특수문자 파일명이 Storage 키를 깨뜨리는 문제가 있었음).
  async function captureShot() {
    const video = videoRef.current;
    if (!video || status !== 'playing' || capturingRef.current || !ep) return;
    capturingRef.current = true;
    setShotState('saving');
    try {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('캡처 실패');

      const path = `${ep.id}-${Date.now()}-clip.jpg`;
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true });
      if (uploadError) throw uploadError;
      const newUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;

      const nextUrls = [...(ep.image_urls || []), newUrl];
      const { error: dbError } = await supabase.from('tvdb_program_episodes').update({ image_urls: nextUrls }).eq('id', ep.id);
      if (dbError) throw dbError;

      ep.image_urls = nextUrls; // 같은 클립 모달에서 연속으로 여러 장 찍을 때 누적되도록 로컬 참조도 갱신
      onImageAdded(ep.id, newUrl);
      setShotState('saved');
      setTimeout(() => setShotState('idle'), 900);
    } catch (e) {
      alert('스샷 저장 실패: ' + e.message);
      setShotState('idle');
    } finally {
      capturingRef.current = false;
    }
  }

  // S키로도 캡처 — 영상 보다가 마우스 안 옮기고 바로바로 찍을 수 있게. 스페이스바는 비디오 기본
  // 재생/정지 토글과 겹쳐서 쓰지 않고, 그 동작을 그대로 살려두기 위해 S를 쓴다.
  useEffect(() => {
    if (!url) return;
    function onKeyDown(e) {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        captureShot();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [url, status, shotState]);

  if (!url) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#000', borderRadius: 10, padding: 12, maxWidth: 800, width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <button onClick={captureShot} disabled={status !== 'playing' || shotState === 'saving'} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12.5, fontWeight: 700,
            cursor: status === 'playing' ? 'pointer' : 'default',
            background: shotState === 'saved' ? '#16a34a' : '#eff6ff',
            color: shotState === 'saved' ? '#fff' : '#2563eb',
            opacity: status === 'playing' ? 1 : 0.5,
          }}>
            {shotState === 'saving' ? '저장 중...' : shotState === 'saved' ? '✓ 저장됨' : '📸 스샷 (S)'}
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#fff', lineHeight: 1 }}>✕</button>
        </div>
        {status === 'loading' && <p style={{ color: '#fff', textAlign: 'center', padding: '60px 0' }}>불러오는 중...</p>}
        {status === 'error' && (
          <div style={{ color: '#fca5a5', textAlign: 'center', padding: '40px 0' }}>
            <p>{errorMsg}</p>
            <a href={url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>원본 페이지에서 열기 ↗</a>
          </div>
        )}
        <video ref={videoRef} controls playsInline style={{
          width: '100%', maxHeight: '75vh', display: status === 'error' ? 'none' : 'block', background: '#000',
        }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
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

// "📋 지침 복사"(캡처용)와 짝을 이루는 두 번째 복사 버튼 — 캡처가 끝난 회차의 image_urls를
// Fresh Season 블로그 글에 "활용할 방법을 찾아 쓰라"는 지침이다.
// 이 텍스트를 받는 클로드는 이 대화도, 이 프로젝트 맥락도 전혀 모르는 완전히 새 세션일 수
// 있다(2026-07-26 대화에서 사용자가 명시적으로 요구한 전제) — 그래서:
//  (a) TVDB·Fresh Season이 각각 뭘 하는 프로젝트인지 한 줄로 설명하고
//  (b) 정확한 MCP 서버 id나 도구 이름을 외워서 아는 것처럼 전제하지 않고, "연결된 MCP 서버
//      설명 중 이런 문구가 있는 걸 찾아라"는 식으로 스스로 찾아내는 방법을 알려주고
//  (c) image_urls의 각 항목이 그냥 URL 문자열일 뿐 자동으로 안 열린다는 것, 로컬로 받아서
//      봐야 한다는 실무 절차까지 적는다.
// 이 사진들을 어떻게 쓸지에 대한 지침은 같은 대화에서 세 번 정정됐다: (1) 처음엔 회차
// content를 그대로 글감으로 박아넣었다가 "우리랑 상관없다"는 지적, (2) 그래서 "새 글감을
// 기획하지 말고 이미 있는 글에 어울리면만 쓰라"로 바꿨더니 "그게 아니라 이 사진을 활용할 수
// 있게끔 스토리를 잡는 것"이라는 재지적 — 즉 사진에 안 맞는 기존 글을 수동적으로 찾는 게
// 아니라, 사진 내용에 맞는 새 글감을 능동적으로 만들어도 된다(오히려 그게 목표)는 뜻이었음.
// 다만 (3) 그 글감은 방송 회차 자체(출연자 개인 사연, 프로그램명 등 DB 텍스트 라벨)를 그대로
// 옮긴 게 아니라, 사진 속 실제 정보를 Fresh Season 사이트 성격에 맞게 재구성한 것이어야 한다
// — 그래서 program_name·content·disease_tags 같은 라벨은 여전히 지침 문구에 안 담는다.
function buildWritingInstruction(ep) {
  return `[TVDB→Fresh Season] 캡처 이미지 활용 요청 (회차 #${ep.id})

배경 설명(이 대화 맥락을 모르는 세션을 위한 것):
- TVDB: 홈쇼핑·방송 편성표를 수집하는 아카이브 프로젝트. tvdb_program_episodes 테이블에 방송 회차별로 화면 캡처 이미지를 모아둔다.
- Fresh Season: 제철 먹거리·건강·TV레시피를 다루는 별도의 블로그 프로젝트. 지금 이 요청은 TVDB에 모아둔 캡처 이미지를, Fresh Season 블로그 글에 쓸 수 있는지 확인해달라는 것이다.
- 이 대화가 이뤄지는 환경에는 여러 프로젝트의 MCP 서버가 각각 연결돼 있고, 서버마다 "이 서버는 무엇을 하는 서버다"라는 설명이 붙어 있다. 정확한 서버 id나 도구 이름을 미리 알 필요 없이, 그 설명 문구로 찾으면 된다.

절차:
1. 연결된 MCP 서버 설명 중 "TVDB"·"홈쇼핑/방송편성표"가 언급된 서버를 찾아, 그 서버의 테이블 조회 도구(get_rows 등)로 tvdb_program_episodes 테이블에서 id=${ep.id} 행을 조회할 것
2. 조회 결과의 image_urls 필드에 이미지 URL들이 들어있다(개수는 회차마다 다르니 조회해서 직접 셀 것) — 각 URL은 공개 이미지 파일 링크다. URL 문자열이나 파일명만 보고 내용을 짐작하지 말고, 몇 개를 실제로 열어서 눈으로 확인할 것(로컬로 내려받아 이미지 도구로 열기, 브라우저로 URL을 직접 열어 보기 등 그 세션에서 쓸 수 있는 방법 아무거나로)
3. 연결된 MCP 서버 설명 중 "제철 먹거리"·"fresh-season"·"블로그 자동화"가 언급된 서버를 찾아, 그 서버의 지침 조회 도구(get_system_prompt 등)를 id="claude"로 호출해 Fresh Season 작업 방식부터 확인할 것
4. 사진에 실제로 담긴 내용(성분·수치·효능·주의사항·조리 장면 등)을 확인한 뒤, 그 사진을 자연스럽게 쓸 수 있는 Fresh Season 글감·스토리를 만들 것 — 사진이 활용되도록 이야기를 구성하는 게 목표다. 단, 방송 회차 자체(출연자 개인 사연, 프로그램명·방영 정보 등)를 그대로 옮기지 말고, 사진 속 정보를 Fresh Season 사이트에 맞는 문제해결형 각도(재료 효능·주의사항 등)로 재구성할 것 — 이때도 Fresh Season의 정상적인 기획 절차(벤치마킹·사실관계 검증·제목 확정 등)는 그대로 따를 것
5. 사진 내용이 Fresh Season과 도저히 안 맞아서 쓸 이야기를 못 만들겠으면, 억지로 만들지 말고 사용자에게 그렇게 보고할 것`;
}

function EpisodeRow({ ep, info, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified, onToggleClipVerified, onPlayClip }) {
  const canWatch = info?.has_replay && info?.replay_url;
  const [copied, setCopied] = useState(false);
  function copyInstruction() {
    navigator.clipboard.writeText(buildCaptureInstruction(ep)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const [writingCopied, setWritingCopied] = useState(false);
  function copyWritingInstruction() {
    navigator.clipboard.writeText(buildWritingInstruction(ep)).then(() => {
      setWritingCopied(true);
      setTimeout(() => setWritingCopied(false), 1500);
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
        <button onClick={copyWritingInstruction} title="이 회차 이미지로 블로그 글쓰기 지침 복사" style={{
          display: 'block', marginTop: 4, padding: '2px 6px', fontSize: 10.5, borderRadius: 4,
          border: '1px solid #ccc', background: writingCopied ? '#dcfce7' : '#fff',
          color: writingCopied ? '#16a34a' : '#7c3aed', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{writingCopied ? '✓ 복사됨' : '📝 글쓰기 지침복사'}</button>
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
            <button key={i} onClick={() => onPlayClip(ep, l)} style={{ ...actionBtnStyle, borderColor: '#c4b5fd', color: '#7c3aed' }}>🎬 클립{i + 1}</button>
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
function DiseaseTable({ episodes, infoMap, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified, onToggleClipVerified, onPlayClip }) {
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
            onToggleClipVerified={onToggleClipVerified} onPlayClip={onPlayClip} />
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
  // 탭(병명별/채널별 + 그 안에서 고른 병명·채널)을 URL 쿼리스트링에 반영해서, 새로고침해도
  // 마지막으로 보던 탭이 그대로 유지되게 한다(2026-07-27, 사용자가 새로고침하면 항상 첫 탭으로
  // 돌아가는 걸 지적). BroadcastPanel.js가 이미 같은 패턴(탭 상태 <-> router.query 동기화)을
  // 쓰고 있어서 그 방식을 그대로 가져왔다.
  const router = useRouter();
  const [rows, setRows] = useState(initialRows || []);
  const [infoMap, setInfoMap] = useState(() => infoRowsToMap(initialInfoRows));
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(generatedAt ? new Date(generatedAt) : null);
  const [linksInstrCopied, setLinksInstrCopied] = useState(false);

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
  const [playClip, setPlayClip] = useState(null); // "🎬 클립N" 버튼으로 재생 중인 { ep, url }

  // 회차별 "📋 지침 복사"(buildCaptureInstruction)는 이미 링크가 있는 회차 하나를 스샷하라는
  // 지침이고, 이건 그 반대 — 아직 links가 비어있는 회차들을 찾아서 채워달라는 페이지 단위 지침.
  // 특정 회차 id가 없어 범용 문구라, 어떤 채널/병명부터 할지는 대화에서 사용자가 지정해주는
  // 걸 전제로 한다(무작정 전체를 다 시키면 범위가 너무 커짐).
  function copyLinksInstruction() {
    const text = `[TVDB] 다시보기·클립 링크 채워넣기 작업 요청

1. TVDB MCP 서버에 연결해서 get_system_prompt로 최신 방법론부터 확인할 것
2. get_rows로 tvdb_program_episodes에서 links가 비어있는(NULL 또는 빈 배열) 회차를 조회
   (채널/프로그램/병명 카테고리 등 범위는 대화에서 별도로 지정된 조건을 따를 것)
3. 채널별로 클립·다시보기 링크 찾는 방법이 다 다르므로, 손대기 전에 tvdb_channel_notes에서
   그 채널 행을 먼저 확인할 것(이미 검증된 방법이 있으면 그대로 재사용, 없으면 새로 찾아서
   기록해둘 것)
4. **회차가 오래돼서 사이트 랜딩페이지의 "최근 클립 목록"(보통 10여 개까지만 보임)에 안
   잡힌다고 바로 "못 찾음"으로 넘기지 말 것.** TV조선은 특히
   POST https://vod.tvchosun.com/vod/getVodReplayOrderByPagingInfo.cstv
   (data: page=N, order_type=latest, search_text=(빈값), year=all, prog_id={prog_id})로
   페이지를 넘기면 훨씬 옛날 회차까지 다 나온다(year=all 필수 — 빈 문자열이면 빈 배열만 옴).
   응답의 prog[].epis_code를 찾으면 https://vod.tvchosun.com/vod/3/{prog_id}/{epis_code}/vod.cstv
   가 그 회차의 전체 다시보기 링크. 다른 채널도 "안 보인다"고 단정하기 전에 페이지네이션/API가
   더 있는지부터 의심할 것(2026-07-26에 이걸 안 써보고 여러 건을 잘못 스킵했다가 사용자가
   직접 찾아줘서 뒤늦게 정정한 사례 있음).
   MBN도 마찬가지 — programMain 페이지는 최근 4개만 보여주지만
   POST https://www.mbn.co.kr/lib/module/program/getProgramReviewThumViewList_E.php
   (data: menuType=50, menuCode={boardId}, prog_seq_no={progCode}, page=N, cnt=4)로
   더 오래된 회차까지 찾을 수 있다(boardId는 programContents/{progCode}/{boardId} URL에서 얻음).
   응답에서 회차번호+내용이 붙어있는 항목의 contentId를 뽑아
   https://www.mbn.co.kr/vod/programContents/previewlist/{progCode}/{boardId}/{contentId} 로 저장.
5. 찾은 링크는 upsert_row로 links 컬럼에 저장
6. 새 방법을 알아냈거나 기존 방법이 바뀐 걸 발견하면 tvdb_channel_notes에도 기록해서
   다음 세션이 재사용할 수 있게 할 것`;
    navigator.clipboard.writeText(text).then(() => {
      setLinksInstrCopied(true);
      setTimeout(() => setLinksInstrCopied(false), 1500);
    });
  }

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
    if (!activeDisease && diseaseKeys.length > 0) {
      // router.isReady가 되기 전(첫 렌더)엔 router.query가 항상 빈 객체라, 그 상태로 먼저
      // 판단해버리면 새로고침 직후 잠깐이라도 무조건 diseaseKeys[0]으로 초기화된다. 새로고침
      // 유지가 핵심 요구사항이라 router.isReady를 기다렸다가 쿼리에 있는 값을 우선한다.
      if (!router.isReady) return;
      const q = router.query;
      const fromQuery = q.view !== 'channel' && typeof q.tab === 'string' && diseaseKeys.includes(q.tab) ? q.tab : diseaseKeys[0];
      setActiveDisease(fromQuery);
    }
  }, [diseaseKeys, activeDisease, router.isReady]);

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
    if (!activeChannel && channels.length > 0) {
      if (!router.isReady) return;
      const q = router.query;
      const fromQuery = q.view === 'channel' && typeof q.channel === 'string' && channels.includes(q.channel) ? q.channel : channels[0];
      setActiveChannel(fromQuery);
    }
  }, [channels, activeChannel, router.isReady]);

  // 새로고침 시 어느 탭(병명별/채널별)이었는지도 함께 복원. viewMode 기본값이 이미 'disease'라
  // 쿼리가 'channel'일 때만 실제로 바꿔주면 된다.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.view === 'channel') setViewMode('channel');
  }, [router.isReady]);

  // 위 두 복원 effect와 반대 방향 — 사용자가 탭이나 병명/채널을 바꿀 때마다 그 상태를 URL에
  // 반영해서, 이 상태에서 새로고침(F5)해도 같은 URL을 다시 요청해 같은 탭으로 돌아오게 한다.
  useEffect(() => {
    if (!router.isReady) return;
    const query = { view: viewMode };
    if (viewMode === 'disease' && activeDisease) query.tab = activeDisease;
    if (viewMode === 'channel' && activeChannel) query.channel = activeChannel;
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeDisease, activeChannel, router.isReady]);

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
    // 중복 URL이 남아있으면 저장할 때마다 다시 끼어들 수 있으니 여기서도 한 번 더 걸러낸다
    // (모달 진입 시 dedupe와 별개로, 저장 경로 자체를 항상 깨끗하게 유지하기 위한 안전장치).
    const combinedUrls = Array.from(new Set([...keptUrls, ...uploadedUrls]));
    const image_urls = combinedUrls.length > 0 ? combinedUrls : null;
    const memoValue = memo?.trim() ? memo.trim() : null;
    const linksValue = links && links.length > 0 ? links : null;
    const { error } = await supabase.from('tvdb_program_episodes').update({ memo: memoValue, image_urls, links: linksValue }).eq('id', memoEp.id);
    setMemoBusy(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === memoEp.id ? { ...r, memo: memoValue, image_urls, links: linksValue } : r)));
    setMemoEp(null);
  }

  // ClipPlayerModal(🎬 클립N 재생창)이 자체적으로 캡처→Storage 업로드→DB update까지 다 끝낸 뒤,
  // 화면의 rows 상태만 이걸로 동기화한다(별도 재조회 없이 즉시 반영).
  function handleClipImageAdded(epId, newUrl) {
    setRows(prev => prev.map(r => (r.id === epId ? { ...r, image_urls: [...(r.image_urls || []), newUrl] } : r)));
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
        <button onClick={copyLinksInstruction} title="links가 비어있는 회차들에 다시보기/클립 링크를 채워달라는 작업지침 복사" style={{
          padding: '6px 12px', borderRadius: 999, border: '1px solid #ccc', fontSize: 12.5, cursor: 'pointer',
          background: linksInstrCopied ? '#dcfce7' : '#fff', color: linksInstrCopied ? '#16a34a' : '#444',
        }}>{linksInstrCopied ? '✓ 복사됨' : '📋 링크 채우기 지침 복사'}</button>
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
                onPlayClip={(ep, url) => setPlayClip({ ep, url })}
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
      <ClipPlayerModal clip={playClip} onClose={() => setPlayClip(null)} onImageAdded={handleClipImageAdded} />
    </div>
  );
}
