import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

const emptyForm = { program_name: '', channel: '', genre: '', description: '', source_url: '', verified: true };

export default function ProgramInfoPanel({ showToast }) {
  const [infoRows, setInfoRows] = useState([]);
  const [missing, setMissing] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const { data: info } = await supabase.from('tvdb_program_info').select('*').order('updated_at', { ascending: false });
    setInfoRows(info || []);

    const { data: programs } = await supabase.from('tvdb_program').select('program_name, channel').limit(2000);
    const seen = new Set();
    const miss = [];
    (programs || []).forEach(p => {
      const matched = (info || []).some(i => i.channel === p.channel && p.program_name.startsWith(i.program_name));
      if (!matched && !seen.has(p.channel + '|' + p.program_name)) {
        seen.add(p.channel + '|' + p.program_name);
        miss.push(p);
      }
    });
    setMissing(miss);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  function startEdit(row) {
    setForm({
      program_name: row.program_name,
      channel: row.channel || '',
      genre: row.genre || '',
      description: row.description || '',
      source_url: row.source_url || '',
      verified: row.verified,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_name' });
    setSaving(false);
    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }
    showToast('✅ 저장 완료');
    setForm(emptyForm);
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

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>📺 프로그램 정보 등록</div>
        <p style={{ fontSize: 13, color: '#4b6e4b', marginTop: -12, marginBottom: 18 }}>
          프로그램명 → 장르·설명·출처 URL을 등록합니다. 회차 번호("101회" 등)는 자동으로 무시하고 매칭합니다.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>프로그램명</label>
              <input placeholder="예: 엄지의 제왕" value={form.program_name}
                onChange={e => setForm(f => ({ ...f, program_name: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>채널</label>
              <input placeholder="예: MBN" value={form.channel}
                onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} style={S.input} />
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
      </div>

      {loading ? <p>불러오는 중...</p> : (
        <>
          <div style={S.card}>
            <div style={S.cardTitle}>❓ 아직 미등록 프로그램 ({missing.length}개)</div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {missing.map((p, idx) => (
                <div key={idx} onClick={() => startNewFromMissing(p)} style={{ ...S.row, cursor: 'pointer' }}>
                  <b>{p.channel}</b> — {p.program_name}
                </div>
              ))}
              {missing.length === 0 && <p style={{ color: '#8aaa8a' }}>없음 (전부 등록됨)</p>}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>✅ 등록된 프로그램 ({infoRows.length}개)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #d1e8d1' }}>
                  <th style={{ padding: 6 }}>채널</th>
                  <th style={{ padding: 6 }}>프로그램명</th>
                  <th style={{ padding: 6 }}>장르</th>
                  <th style={{ padding: 6 }}>확인됨</th>
                  <th style={{ padding: 6 }}></th>
                </tr>
              </thead>
              <tbody>
                {infoRows.map(row => (
                  <tr key={row.program_name} style={{ borderBottom: '1px solid #eef6ee' }}>
                    <td style={{ padding: 6 }}>{row.channel}</td>
                    <td style={{ padding: 6 }}>{row.program_name}</td>
                    <td style={{ padding: 6 }}>{row.genre}</td>
                    <td style={{ padding: 6 }}>{row.verified ? '✅' : '❌'}</td>
                    <td style={{ padding: 6 }}>
                      <button onClick={() => startEdit(row)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
