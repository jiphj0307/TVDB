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

export default function ShoppingChannelNotes({ showToast }) {
  const [channels, setChannels] = useState([]);
  const [notes, setNotes] = useState({});   // channel -> 저장된 note
  const [drafts, setDrafts] = useState({}); // channel -> 편집 중인 note
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('tvdb_shopping').select('channel').range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const uniq = Array.from(new Set(all.map(r => r.channel).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    setChannels(uniq);

    const { data: noteRows } = await supabase.from('tvdb_channel_notes').select('channel, note').in('channel', uniq);
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
    showToast?.(`✅ [${channel}] 메모 저장 완료`);
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>📝 채널별 메모</div>
      <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 12 }}>
        16개 홈쇼핑 채널의 수집방법 메모를 한 화면에서 확인·수정합니다.
        🟢 직접 curl 가능 / 🟡 크롬클로드(브라우저) 필요로 태그돼 있습니다.
      </p>
      {loading ? <p>불러오는 중...</p> : channels.length === 0 ? <p style={{ color: '#8aaa8a' }}>채널 데이터가 없습니다.</p> : (
        channels.map(channel => {
          const tag = parseTag(notes[channel]);
          const dirty = (drafts[channel] || '') !== (notes[channel] || '');
          return (
            <div key={channel} style={{ ...S.row, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>{channel}</span>
                <TagBadge tag={tag} />
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
