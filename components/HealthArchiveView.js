
import { useEffect, useMemo, useState } from 'react';
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
  useEffect(() => {
    setSelected(new Set(episode?.disease_tags || []));
  }, [episode]);
  if (!episode) return null;
  function toggle(label) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {DISEASE_DEFS.map(d => (
            <button key={d.key} onClick={() => toggle(d.label)} style={{
              padding: '5px 11px', borderRadius: 999, border: '1px solid #ccc', fontSize: 12, cursor: 'pointer',
              background: selected.has(d.label) ? '#222' : '#fff', color: selected.has(d.label) ? '#fff' : '#222',
            }}>{d.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSave(Array.from(selected))} disabled={busy} style={{
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

// 회차 하나에 자유 메모 + 링크 여러 개 + 이미지 한 장을 등록하는 모달. 이미지는 STORAGE_BUCKET
// (공개 버킷)에 업로드하고 공개 URL만 tvdb_program_episodes.image_url에 저장한다(파일 자체는
// DB가 아니라 Storage에 있음). 새 파일을 고르면 즉시 로컬 미리보기(URL.createObjectURL)만
// 보여주고, 실제 업로드는 "저장"을 눌렀을 때 한 번에 한다 — 모달 열고 파일만 고른 채 닫으면
// 업로드가 안 일어나야 하므로.
// 링크는 "+"를 누를 때마다 입력칸이 하나씩 늘어나는 방식(개수 제한 없음, tvdb_program_episodes.
// links text[] 배열에 그대로 저장) — 이미지와 달리 여러 개 등록 가능.
function MemoImageModal({ episode, onSave, onClose, busy }) {
  const [memo, setMemo] = useState('');
  const [links, setLinks] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  useEffect(() => {
    setMemo(episode?.memo || '');
    setLinks(episode?.links && episode.links.length > 0 ? episode.links : []);
    setFile(null);
    setPreview(null);
    setRemoveImage(false);
  }, [episode]);

  if (!episode) return null;

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setRemoveImage(false);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function addLink() {
    setLinks(ls => [...ls, '']);
  }
  function updateLink(idx, value) {
    setLinks(ls => ls.map((l, i) => (i === idx ? value : l)));
  }
  function removeLink(idx) {
    setLinks(ls => ls.filter((_, i) => i !== idx));
  }

  const currentImageUrl = removeImage ? null : (preview || episode.image_url);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 480, width: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>메모 · 이미지</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 14px' }}>[{episode.channel}] {episode.program_name} {episode.episode_no}회</p>

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

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>이미지 <span style={{ fontWeight: 400, color: '#999' }}>(1장만 등록 가능)</span></label>
        {currentImageUrl && (
          <div style={{ marginBottom: 8 }}>
            <img src={currentImageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, display: 'block' }} />
            <button type="button" onClick={() => { setRemoveImage(true); setFile(null); setPreview(null); }} style={{
              marginTop: 6, padding: '3px 9px', fontSize: 11.5, borderRadius: 6, border: '1px solid #fecaca',
              background: '#fff', color: '#dc2626', cursor: 'pointer',
            }}>이미지 삭제</button>
          </div>
        )}
        <input type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: 12.5, marginBottom: 18 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onSave({ memo, file, removeImage, links: links.map(l => l.trim()).filter(Boolean) })} disabled={busy} style={{
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

function EpisodeRow({ ep, info, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified }) {
  const canWatch = info?.has_replay && info?.replay_url;
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '6px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.air_date || '-'}</td>
      <td style={{ padding: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.channel}</td>
      <td style={{ padding: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{ep.program_name}<span style={{ color: '#aaa' }}> {ep.episode_no}회</span></td>
      <td style={{ padding: '6px' }}>
        {ep.content}
        {ep.image_url && (
          <img src={ep.image_url} alt="" style={{ display: 'block', marginTop: 6, maxHeight: 48, borderRadius: 4 }} />
        )}
        {ep.memo && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: '#7c5c00', background: '#fff8e1', borderRadius: 4, padding: '3px 6px' }}>
            📝 {ep.memo}
          </div>
        )}
        {ep.links && ep.links.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ep.links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#2563eb', wordBreak: 'break-all' }}>🔗 {l}</a>
            ))}
          </div>
        )}
      </td>
      <td style={{ padding: '6px', verticalAlign: 'top' }}>
        <StatusCheckbox checked={ep.blog_used} onChange={() => onToggleBlogUsed(ep)} label="블로그 사용완료" />
      </td>
      <td style={{ padding: '6px', verticalAlign: 'top' }}>
        <StatusCheckbox checked={ep.video_verified} onChange={() => onToggleVideoVerified(ep)} label="영상확인완료" />
      </td>
      <td style={{ padding: '6px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {canWatch ? (
            <a href={info.replay_url} target="_blank" rel="noreferrer" style={{ ...actionBtnStyle, borderColor: '#93c5fd', color: '#2563eb' }}>▶ 바로가기</a>
          ) : (
            <span style={{ ...actionBtnStyle, color: '#bbb', cursor: 'default' }}>다시보기 없음</span>
          )}
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
function DiseaseTable({ episodes, infoMap, onEdit, onDelete, onEditMemo, onToggleBlogUsed, onToggleVideoVerified }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #222', color: '#888' }}>
          <th style={{ padding: '6px', width: 90 }}>방영일</th>
          <th style={{ padding: '6px', width: 70 }}>채널</th>
          <th style={{ padding: '6px', width: 160 }}>프로그램</th>
          <th style={{ padding: '6px' }}>내용</th>
          <th style={{ padding: '6px', width: 90 }}>블로그</th>
          <th style={{ padding: '6px', width: 90 }}>영상확인</th>
          <th style={{ padding: '6px', width: 250 }}>관리</th>
        </tr>
      </thead>
      <tbody>
        {episodes.map(ep => (
          <EpisodeRow key={ep.id} ep={ep} info={infoMap?.get(`${ep.channel}|${ep.program_name}`)}
            onEdit={onEdit} onDelete={onDelete} onEditMemo={onEditMemo}
            onToggleBlogUsed={onToggleBlogUsed} onToggleVideoVerified={onToggleVideoVerified} />
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
      fetchAllPages('tvdb_program_episodes', 'id, channel, program_name, episode_no, air_date, content, disease_tags, blog_used, video_verified, memo, image_url, links'),
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

  // 병명 탭 — 메모/링크/이미지 저장. 새 파일이 있으면 먼저 Storage에 올리고 공개 URL을 받은 뒤
  // memo/links와 함께 한 번에 UPDATE한다. "이미지 삭제"만 눌렀으면 업로드 없이 image_url을 null로.
  // 링크는 빈 문자열을 걸러낸 배열을 그대로 저장하고, 하나도 없으면 null로 되돌린다.
  async function handleSaveMemoImage({ memo, file, removeImage, links }) {
    if (!memoEp) return;
    setMemoBusy(true);
    let image_url = removeImage ? null : memoEp.image_url;
    if (file) {
      const path = `${memoEp.id}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
      if (uploadError) {
        setMemoBusy(false);
        alert('이미지 업로드 실패: ' + uploadError.message);
        return;
      }
      image_url = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const memoValue = memo?.trim() ? memo.trim() : null;
    const linksValue = links && links.length > 0 ? links : null;
    const { error } = await supabase.from('tvdb_program_episodes').update({ memo: memoValue, image_url, links: linksValue }).eq('id', memoEp.id);
    setMemoBusy(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    setRows(prev => prev.map(r => (r.id === memoEp.id ? { ...r, memo: memoValue, image_url, links: linksValue } : r)));
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
