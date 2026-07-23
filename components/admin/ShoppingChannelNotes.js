import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

// tvdb_channel_notes.note는 앞에 "[수집방식: 직접 curl 가능]" / "[수집방식: 크롬클로드 필요]" 태그가
// 붙어있으면 그걸 파싱해서 배지로 보여주고, 나머지는 원문 그대로 편집 가능하게 둔다.
function parseTag(note) {
  const m = /^\[수집방식: ([^\]]+)\]\s*/.exec(note || '');
  return m ? m[1] : null;
}

function TagBadge({ tag }) {
  if (!tag) return null;
  const isDirect = tag.includes('직접');
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      marginLeft: 8, background: isDirect ? '#dcfce7' : '#fef3c7', color: isDirect ? '#16a34a' : '#b45309',
    }}>{isDirect ? '🟢 직접 curl 가능' : '🟡 크롬클로드 필요'}</span>
  );
}

// 메모 원문(URL·curl·CSS셀렉터 같은 기술적 내용)을 그대로 복사하면 안 됨 —
// 크롬클로드에겐 딥링크/API/MCP 얘기를 하면 안 되고(사이트 접속 자체가 안 되거나 혼란만 줌),
// 클로드에게 줄 때도 "무엇을 해달라"는 지침 문장이 필요하지 원본 메모가 아니다.
// 그래서 메모에서 사이트 도메인만 뽑아 실제로 붙여넣을 수 있는 요청 문장을 새로 만든다.
function extractDomain(note) {
  const m = /((?:[a-zA-Z0-9-]+\.)+(?:co\.kr|com|kr|net))/.exec(note || '');
  return m ? m[1] : null;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// 일반방송(BroadcastPanel)·채널별 수집 현황과 동일하게, 매주 항상 "이번 주 일요일까지" 채워두는 게 목표
function thisSundayStr() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return toDateStr(d);
}
function nextDayStr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}
function daysBehind(dateStr, target) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(target + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// status(그 채널의 tvdb_shopping 보유 현황)가 있으면 "마지막 수집일 다음날"부터, 아예 데이터가
// 없는 채널이면 오늘부터 요청한다 — 이미 채워진 날짜를 다시 조사해달라고 하지 않기 위함.
function buildInstruction(channel, note, status) {
  const tag = parseTag(note);
  const sunday = thisSundayStr();
  const start = status ? nextDayStr(status.max) : toDateStr(new Date());
  if (start > sunday) return null; // 이미 이번 주 일요일까지 완료됨
  if (tag && tag.includes('크롬')) {
    const domain = extractDomain(note);
    const where = domain ? `${channel}(${domain})` : channel;
    return `${where} 접속해서 편성표 메뉴 찾아 들어가서 ${start}부터 ${sunday}(이번 주 일요일)까지 편성표를 '시간 - 프로그램명' 형식으로 조사해줘.`;
  }
  return `TVDB MCP 접속해서 ${channel} 홈쇼핑 편성표를 ${start}부터 ${sunday}(이번 주 일요일)까지 가져와서 tvdb_shopping에 채워줘.`;
}

// 채널별 메모와 같은 tvdb_channel_notes 테이블을 그대로 쓰되, 실제 채널명이 될 수 없는 키를 예약해서
// "전체 작업 메모"를 저장한다. channels 배열은 tvdb_shopping에 실제로 있는 채널명에서만 뽑아내므로
// 이 키가 채널 목록/정렬에 섞여 들어올 일이 없고, 화면에서도 목록 루프 바깥에 따로 그려서 항상 맨 위에
// 고정된다 — 뒤처진 채널 순 정렬과 무관하게 순서가 안 바뀐다.
const GENERAL_NOTE_KEY = '__전체작업메모__';

export default function ShoppingChannelNotes({ showToast }) {
  const [channels, setChannels] = useState([]);
  const [notes, setNotes] = useState({});   // channel -> 저장된 note (GENERAL_NOTE_KEY 포함)
  const [drafts, setDrafts] = useState({}); // channel -> 편집 중인 note (GENERAL_NOTE_KEY 포함)
  const [status, setStatus] = useState({}); // channel -> { min, max, count }
  const [loading, setLoading] = useState(true);
  const [copiedChannel, setCopiedChannel] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('tvdb_shopping').select('channel, broadcast_date').range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const statusMap = {};
    for (const r of all) {
      statusMap[r.channel] ??= { min: r.broadcast_date, max: r.broadcast_date, count: 0 };
      const e = statusMap[r.channel];
      if (r.broadcast_date < e.min) e.min = r.broadcast_date;
      if (r.broadcast_date > e.max) e.max = r.broadcast_date;
      e.count += 1;
    }
    setStatus(statusMap);

    // 뒤처진(마지막 수집일이 오래된) 채널이 위로 오도록 정렬 — 채널별 수집 현황 탭과 동일한 순서
    const uniq = Object.keys(statusMap).sort((a, b) => {
      const ma = statusMap[a].max, mb = statusMap[b].max;
      return ma < mb ? -1 : ma > mb ? 1 : a.localeCompare(b, 'ko');
    });
    setChannels(uniq);

    const { data: noteRows } = await supabase.from('tvdb_channel_notes').select('channel, note').in('channel', [...uniq, GENERAL_NOTE_KEY]);
    const map = {};
    (noteRows || []).forEach(r => { map[r.channel] = r.note || ''; });
    setNotes(map);
    setDrafts(map);
    setLoading(false);
  }

  async function saveNote(channel) {
    const value = (drafts[channel] || '').trim();
    const { error } = await supabase.from('tvdb_channel_notes').upsert({
      channel, note: value, updated_at: new Date().toISOString(),
    }, { onConflict: 'channel' });
    if (error) { showToast?.('❌ 메모 저장 실패: ' + error.message); return; }
    setNotes(prev => ({ ...prev, [channel]: value }));
    showToast?.(channel === GENERAL_NOTE_KEY ? '✅ 전체 작업 메모 저장 완료' : `✅ [${channel}] 메모 저장 완료`);
  }

  // 저장된 메모 원문이 아니라, 크롬클로드나 클로드에게 바로 붙여넣을 수 있는 실행 지침 문장을 복사한다.
  async function copyNote(channel) {
    const text = buildInstruction(channel, notes[channel] || '', status[channel]);
    if (!text) { showToast?.(`✅ [${channel}] 이미 이번 주 일요일까지 완료돼서 요청할 게 없습니다`); return; }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedChannel(channel);
      setTimeout(() => setCopiedChannel(c => (c === channel ? null : c)), 2000);
    } catch {
      window.prompt('복사가 안 되면 아래 텍스트를 직접 선택해서 복사하세요:', text);
    }
  }

  const generalDirty = (drafts[GENERAL_NOTE_KEY] || '') !== (notes[GENERAL_NOTE_KEY] || '');

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>📝 채널별 메모</div>
      <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 12 }}>
        16개 홈쇼핑 채널의 수집방법 메모와 수집 현황을 한 화면에서 확인·수정합니다(뒤처진 채널이 위로 정렬).
        🟢 직접 curl 가능 / 🟡 크롬클로드(브라우저) 필요로 태그돼 있습니다.
        📋 버튼을 누르면 "마지막 수집일 다음날부터 이번 주 일요일까지" 조사해달라는 요청 문장이 복사됩니다 —
        🟡 채널은 크롬클로드 채팅창에, 🟢 채널은 클로드(이 관리자 밖 대화창)에 그대로 붙여넣으면 됩니다.
      </p>

      {loading ? <p>불러오는 중...</p> : (
        <div style={{ ...S.row, marginBottom: 16, border: '1.5px solid #16a34a', background: '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 4 }}>
            <span style={{ fontWeight: 700 }}>📌 전체 작업 메모</span>
          </div>
          <div style={{ fontSize: 12, color: '#8aaa8a', marginBottom: 8 }}>
            특정 채널이 아니라 홈쇼핑 수집 작업 전체에 걸친 메모(공통 주의사항, 진행 상황 등)를 적어두는 자리입니다. 정렬과 무관하게 항상 맨 위에 고정됩니다.
          </div>
          <textarea
            rows={3}
            value={drafts[GENERAL_NOTE_KEY] || ''}
            onChange={e => setDrafts(prev => ({ ...prev, [GENERAL_NOTE_KEY]: e.target.value }))}
            style={S.textarea}
            placeholder="예: 매주 일요일까지 채워두는 게 목표, 카테고리 미분류는 미분류 검토 탭에서 처리"
          />
          <button
            type="button"
            onClick={() => saveNote(GENERAL_NOTE_KEY)}
            disabled={!generalDirty}
            style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, marginTop: 8, opacity: generalDirty ? 1 : 0.5 }}
          >
            메모 저장
          </button>
        </div>
      )}

      {loading ? null : channels.length === 0 ? <p style={{ color: '#8aaa8a' }}>채널 데이터가 없습니다.</p> : (
        channels.map(channel => {
          const tag = parseTag(notes[channel]);
          const dirty = (drafts[channel] || '') !== (notes[channel] || '');
          const st = status[channel];
          const sunday = thisSundayStr();
          const behind = st ? daysBehind(st.max, sunday) : null;
          return (
            <div key={channel} style={{ ...S.row, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 4 }}>
                <span style={{ fontWeight: 700 }}>{channel}</span>
                <TagBadge tag={tag} />
                <button
                  type="button"
                  onClick={() => copyNote(channel)}
                  style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11, marginLeft: 8 }}
                >
                  {copiedChannel === channel ? '✅ 복사됨' : '📋 지침 복사'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#8aaa8a', marginBottom: 8 }}>
                {st ? (
                  <>
                    보유 {st.min} ~ {st.max} ({st.count}건) · 마지막 수집일 {st.max} ·{' '}
                    <span style={{
                      fontWeight: 700,
                      color: behind <= 0 ? '#16a34a' : behind >= 2 ? '#dc2626' : '#d97706',
                    }}>
                      {behind <= 0 ? `${sunday} 완료` : `${behind}일 뒤처짐`}
                    </span>
                  </>
                ) : '데이터 없음 (아직 수집된 적 없음)'}
              </div>
              <textarea
                rows={3}
                value={drafts[channel] || ''}
                onChange={e => setDrafts(prev => ({ ...prev, [channel]: e.target.value }))}
                style={S.textarea}
                placeholder="수집방법 메모"
              />
              <button
                type="button"
                onClick={() => saveNote(channel)}
                disabled={!dirty}
                style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, marginTop: 8, opacity: dirty ? 1 : 0.5 }}
              >
                메모 저장
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
