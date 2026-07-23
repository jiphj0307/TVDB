import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

const emptyForm = { program_name: '', channel: '', genre: '', description: '', source_url: '', verified: true, air_day: '', air_time: '' };

const GROUP_LABEL = { tv: '📺 TV 채널', shopping: '🛍️ 홈쇼핑 채널' };

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>프로그램명 / 상품명</label>
              <input value={form.program_name}
                onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>채널</label>
              <input value={form.channel}
                onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} style={S.input} />
            </div>
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
            <label style={S.label}>출처 URL</label>
            <input value={form.source_url}
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
            <button type="button" onClick={onCancel} style={S.btnGhost}>취소</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProgramInfoPanel({ showToast }) {
  const [infoRows, setInfoRows] = useState([]);
  const [channels, setChannels] = useState([]); // [{ channel, source, missing:[], registered:[] }]
  const [notes, setNotes] = useState({}); // channel -> 편집 중인 메모
  const [savedNotes, setSavedNotes] = useState({}); // channel -> 마지막 저장된 메모 (dirty 체크용)
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  // 기존 항목 "수정"은 이 상태로 뜨는 모달에서 처리한다(위 form/handleSubmit은 신규 등록 전용).
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const { data: info } = await supabase.from('tvdb_program_info').select('*').order('updated_at', { ascending: false });
    setInfoRows(info || []);

    const { data: programs } = await supabase.from('tvdb_program').select('program_name, channel').limit(2000);
    const { data: shopping } = await supabase.from('tvdb_shopping').select('product_name, channel').limit(2000);
    const { data: noteRows } = await supabase.from('tvdb_channel_notes').select('*');

    const noteMap = {};
    (noteRows || []).forEach(n => { noteMap[n.channel] = n.note || ''; });
    setNotes(noteMap);
    setSavedNotes(noteMap);

    const items = [
      ...(programs || []).map(p => ({ name: p.program_name, channel: p.channel, source: 'tv' })),
      ...(shopping || []).map(p => ({ name: p.product_name, channel: p.channel, source: 'shopping' })),
    ];

    const byChannel = {};
    const seen = new Set();
    items.forEach(({ name, channel, source }) => {
      if (!channel || !name) return;
      const key = channel + '|' + name;
      if (seen.has(key)) return;
      seen.add(key);
      if (!byChannel[channel]) byChannel[channel] = { channel, source, missing: [], registered: [] };

      const matched = (info || []).find(i => i.channel === channel && name.startsWith(i.program_name));
      if (matched) {
        if (!byChannel[channel].registered.some(r => r.program_name === matched.program_name)) {
          byChannel[channel].registered.push(matched);
        }
      } else {
        byChannel[channel].missing.push({ program_name: name, channel });
      }
    });

    // 일반방송(tv) 채널의 등록된 프로그램 목록은 원래 DB 조회 순서 그대로 쌓여서
    // 뒤죽박죽으로 보였다 — 가나다순으로 다시 정렬해서 보여준다.
    const list = Object.values(byChannel).map(g => {
      if (g.source === 'tv') {
        g.registered = [...g.registered].sort((a, b) => a.program_name.localeCompare(b.program_name, 'ko'));
      }
      return g;
    }).sort((a, b) => {
      if (a.source !== b.source) return a.source === 'tv' ? -1 : 1;
      return a.channel.localeCompare(b.channel, 'ko');
    });
    setChannels(list);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  function startEdit(row) {
    setEditForm({
      program_name: row.program_name,
      channel: row.channel || '',
      genre: row.genre || '',
      description: row.description || '',
      source_url: row.source_url || '',
      verified: row.verified,
      air_day: row.air_day || '',
      air_time: row.air_time || '',
    });
  }

  function startNewFromMissing(p) {
    setForm({ ...emptyForm, program_name: p.program_name, channel: p.channel });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.program_name.trim()) { showToast('❌ 프로그램명은 필수입니다'); return; }
    setSaving(true);
    const { error } = await supabase.from('tvdb_program_info').upsert({
      program_name: form.program_name.trim(),
      channel: form.channel.trim() || null,
      genre: form.genre.trim() || null,
      description: form.description.trim() || null,
      source_url: form.source_url.trim() || null,
      verified: !!form.verified,
      air_day: form.air_day.trim() || null,
      air_time: form.air_time.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setForm(emptyForm);
    loadAll();
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editForm.program_name.trim()) { showToast('❌ 프로그램명은 필수입니다'); return; }
    setEditSaving(true);
    const { error } = await supabase.from('tvdb_program_info').upsert({
      program_name: editForm.program_name.trim(),
      channel: editForm.channel.trim() || null,
      genre: editForm.genre.trim() || null,
      description: editForm.description.trim() || null,
      source_url: editForm.source_url.trim() || null,
      verified: !!editForm.verified,
      air_day: editForm.air_day.trim() || null,
      air_time: editForm.air_time.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setEditSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setEditForm(null);
    loadAll();
  }

  async function handleApplyGenre() {
    setApplying(true);
    showToast('⏳ tvdb_program에 장르 반영 중...');
    const { data: infos } = await supabase.from('tvdb_program_info').select('*').not('genre', 'is', null);
    let updated = 0;
    for (const info of infos || []) {
      const { data: matches } = await supabase
        .from('tvdb_program')
        .select('id')
        .eq('channel', info.channel)
        .ilike('program_name', `${info.program_name}%`);
      for (const m of matches || []) {
        await supabase.from('tvdb_program').update({ genre: info.genre }).eq('id', m.id);
        updated++;
      }
    }
    setApplying(false);
    showToast(`✅ ${updated}건 반영 완료`);
  }

  async function saveNote(channel) {
    const note = (notes[channel] || '').trim();
    const { error } = await supabase.from('tvdb_channel_notes').upsert({
      channel,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel' });
    if (error) { showToast('❌ 메모 저장 실패: ' + error.message); return; }
    setSavedNotes(s => ({ ...s, [channel]: note }));
    showToast(`✅ [${channel}] 메모 저장 완료`);
  }

  const totalMissing = channels.reduce((sum, c) => sum + c.missing.length, 0);
  const totalRegistered = channels.reduce((sum, c) => sum + c.registered.length, 0);

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>📺 프로그램 정보 등록</div>
        <p style={{ fontSize: 13, color: '#4b6e4b', marginTop: -12, marginBottom: 18 }}>
          프로그램명(또는 홈쇼핑 상품명) → 장르·설명·출처 URL을 등록합니다. 회차 번호("101회" 등)는 자동으로 무시하고 매칭합니다.
          이미 등록된 항목을 고칠 땐 아래 목록에서 "수정" 버튼을 누르면 뜨는 모달을 쓰세요 — 이 폼은 신규 등록 전용입니다.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>프로그램명 / 상품명</label>
              <input placeholder="예: 엄지의 제왕" value={form.program_name}
                onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>채널</label>
              <input placeholder="예: MBN 또는 GS홈쇼핑" value={form.channel}
                onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} style={S.input} />
            </div>
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
            <label style={S.label}>장르</label>
            <input placeholder="예: 예능(건강정보)" value={form.genre}
              onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} style={S.input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>설명</label>
            <textarea placeholder="이 프로그램(상품)이 어떤 내용인지" value={form.description} rows={3}
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
        <button onClick={handleApplyGenre} disabled={applying} style={{ ...S.btn('#2a7a2a'), opacity: applying ? 0.6 : 1 }}>
          {applying ? '반영 중...' : '등록된 장르를 tvdb_program에 전부 반영'}
        </button>
        <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: 8, marginBottom: 0 }}>
          홈쇼핑은 tvdb_shopping에 이미 category 컬럼이 있어서 이 버튼의 반영 대상에서는 제외했습니다.
        </p>
      </div>

      {loading ? <p>불러오는 중...</p> : (
        <>
          <p style={{ fontSize: 13, color: '#4b6e4b', marginBottom: 12 }}>
            전체 등록 {totalRegistered}건 / 미등록 {totalMissing}건 — 채널 {channels.length}개
          </p>
          {['tv', 'shopping'].map(src => {
            const group = channels.filter(c => c.source === src);
            if (group.length === 0) return null;
            return (
              <div key={src} style={S.card}>
                <div style={S.cardTitle}>{GROUP_LABEL[src]} ({group.length}개 채널)</div>
                {group.map(g => (
                  <details key={g.channel} style={{ marginBottom: 10, border: '1px solid #eef6ee', borderRadius: 10, padding: '10px 14px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                      {g.channel} — 등록 {g.registered.length} / 미등록 {g.missing.length}
                    </summary>

                    <div style={{ marginTop: 12 }}>
                      <label style={S.label}>이 채널 프로그램(상품) 정보를 어떻게 가져오는지 메모</label>
                      <textarea rows={2} value={notes[g.channel] || ''}
                        onChange={e => setNotes(n => ({ ...n, [g.channel]: e.target.value }))}
                        style={S.textarea}
                        placeholder="예: 나무위키에 채널 프로그램별 문서가 잘 정리돼있음 / 공식 앱 상품상세 페이지에서 확인" />
                      <button type="button" onClick={() => saveNote(g.channel)}
                        disabled={(notes[g.channel] || '') === (savedNotes[g.channel] || '')}
                        style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12, marginTop: 6, opacity: (notes[g.channel] || '') === (savedNotes[g.channel] || '') ? 0.5 : 1 }}>
                        메모 저장
                      </button>
                    </div>

                    {g.missing.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>❓ 미등록 ({g.missing.length})</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {g.missing.map((p, idx) => (
                            <div key={idx} onClick={() => startNewFromMissing(p)} style={{ ...S.row, cursor: 'pointer' }}>
                              {p.program_name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {g.registered.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid #d1e8d1' }}>
                            <th style={{ padding: 6 }}>프로그램명 / 상품명</th>
                            <th style={{ padding: 6 }}>요일</th>
                            <th style={{ padding: 6 }}>시간</th>
                            <th style={{ padding: 6 }}>장르</th>
                            <th style={{ padding: 6 }}>확인됨</th>
                            <th style={{ padding: 6 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.registered.map(row => (
                            <tr key={row.program_name} style={{ borderBottom: '1px solid #eef6ee' }}>
                              <td style={{ padding: 6 }}>{row.program_name}</td>
                              <td style={{ padding: 6, color: '#4b6e4b' }}>{row.air_day}</td>
                              <td style={{ padding: 6, color: '#4b6e4b' }}>{row.air_time}</td>
                              <td style={{ padding: 6 }}>{row.genre}</td>
                              <td style={{ padding: 6 }}>{row.verified ? '✅' : '❌'}</td>
                              <td style={{ padding: 6 }}>
                                <button onClick={() => startEdit(row)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>수정</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </details>
                ))}
              </div>
            );
          })}
        </>
      )}

      <EditModal form={editForm} setForm={setEditForm} onSave={handleEditSubmit} onCancel={() => setEditForm(null)} saving={editSaving} />
    </div>
  );
}
