import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S, Toggle, ConfirmModal } from './AdminUI';

const ACCENT = '#ea580c';
const EMPTY_LINK = { label: '', url: '', enabled: true };
const EMPTY_WIDGET = { label: '', size: '728x90', widget_html: '', enabled: true };

const BANNER_SIZE_OPTIONS = [
  { value: '728x90', label: '728×90' },
  { value: '300x250', label: '300×250' },
  { value: '160x600', label: '160×600' },
  { value: '320x100', label: '320×100' },
  { value: '320x50', label: '320×50' },
];

function ShortcutCard() {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>🔗 쿠팡 파트너스</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.6 }}>
        링크/배너는 반드시 쿠팡 파트너스 사이트에서 직접 생성해야 실적(수익)으로 집계됩니다.
      </div>
      <a href="https://partners.coupang.com/" target="_blank" rel="noopener noreferrer"
        style={{ ...S.btn(ACCENT), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
        🔗 쿠팡파트너스 바로가기
      </a>
    </div>
  );
}

function RepeatableRow({ table, item, isNew, fields, onSaved, onDeleted, onCancelNew, renderPreview }) {
  const [form, setForm] = useState(item);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(isNew);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload = { ...form };
    if (!isNew) payload.id = item.id;
    const { data, error } = await supabase.from(table).upsert(payload).select().single();
    setSaving(false);
    if (error) { alert('저장 실패: ' + error.message); return; }
    onSaved(data);
  };

  const del = async () => {
    setDeleting(true);
    const { error } = await supabase.from(table).delete().eq('id', item.id);
    setDeleting(false);
    setConfirmOpen(false);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    onDeleted(item.id);
  };

  return (
    <div style={{ ...S.row, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen(p => !p)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#0f1f0f' }}>{form.label || (isNew ? '(새 항목)' : '(이름없음)')}</span>
          {form.size && (
            <span style={{ fontSize: 11, color: ACCENT, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 999, padding: '1px 8px', fontWeight: 700 }}>
              {form.size}
            </span>
          )}
          {form.enabled ? <span style={{ fontSize: 11, color: '#16a34a' }}>● 사용중</span> : <span style={{ fontSize: 11, color: '#9ca3af' }}>○ 꺼짐</span>}
        </div>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
      </div>

      {renderPreview && (form.widget_html || form.url) && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#fafaf9', border: '1px dashed #d1e8d1', borderRadius: 8, overflow: 'auto' }}>
          {renderPreview(form)}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={S.label}>{f.label}</label>
              {f.type === 'select' ? (
                <select value={form[f.key] || f.options[0]?.value} onChange={e => set(f.key, e.target.value)} style={S.input}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3} style={S.textarea} placeholder={f.placeholder} />
              ) : (
                <input value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} style={S.input} />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={S.label}>사용</label>
            <Toggle value={form.enabled} onChange={v => set('enabled', v)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ ...S.btn(ACCENT), flex: 1, opacity: saving ? 0.6 : 1 }}>
              {saving ? '저장 중...' : (isNew ? '추가' : '저장하기')}
            </button>
            {isNew ? (
              <button onClick={onCancelNew} style={S.btnGhost}>취소</button>
            ) : (
              <button onClick={() => setConfirmOpen(true)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>
                삭제
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmModal open={confirmOpen} title="삭제 확인" message={`"${form.label || '이 항목'}"을(를) 삭제할까요?`}
        confirmLabel={deleting ? '삭제 중...' : '삭제'} cancelLabel="취소"
        onConfirm={deleting ? undefined : del} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}

function RepeatableListCard({ table, title, description, empty, fields, addLabel, renderPreview }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDraft, setNewDraft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from(table).select('*').order('id', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, [table]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>{title}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: -12, marginBottom: 16 }}>{description}</div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '20px 0' }}>불러오는 중...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {items.map(it => (
            <RepeatableRow key={it.id} table={table} item={it} isNew={false} fields={fields} renderPreview={renderPreview}
              onSaved={(updated) => setItems(p => p.map(x => x.id === updated.id ? updated : x))}
              onDeleted={(id) => setItems(p => p.filter(x => x.id !== id))} />
          ))}
          {newDraft && (
            <RepeatableRow table={table} item={newDraft} isNew={true} fields={fields} renderPreview={renderPreview}
              onSaved={(created) => { setItems(p => [...p, created]); setNewDraft(null); }}
              onDeleted={() => {}} onCancelNew={() => setNewDraft(null)} />
          )}
          {items.length === 0 && !newDraft && (
            <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '10px 0' }}>아직 등록된 항목이 없어요.</div>
          )}
        </div>
      )}

      {!newDraft && <button onClick={() => setNewDraft({ ...empty })} style={{ ...S.btn(ACCENT), width: '100%' }}>{addLabel}</button>}
    </div>
  );
}

export default function CoupangPanel() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1f0f' }}>🛒 쿠팡 관리</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>쿠팡 파트너스 사이트에서 만든 링크/위젯을 등록하세요.</div>
      </div>

      <ShortcutCard />

      <RepeatableListCard
        table="tvdb_coupang_links"
        title="📋 링크 목록"
        description="쿠팡 링크(URL)만 추가하는 목록입니다."
        empty={EMPTY_LINK}
        addLabel="+ 링크 추가"
        fields={[
          { key: 'label', label: '이름 (구분용)', placeholder: '예: 오늘의 특가' },
          { key: 'url', label: '링크 URL', placeholder: 'https://link.coupang.com/a/...' },
        ]}
        renderPreview={(item) => <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>}
      />

      <RepeatableListCard
        table="tvdb_coupang_widgets"
        title="🖼️ 배너/위젯 목록"
        description="쿠팡 파트너스에서 만든 배너/위젯 HTML 코드를 등록하세요."
        empty={EMPTY_WIDGET}
        addLabel="+ 배너/위젯 추가"
        fields={[
          { key: 'label', label: '이름 (구분용)', placeholder: '예: 로켓프레시1' },
          { key: 'size', label: '사이즈', type: 'select', options: BANNER_SIZE_OPTIONS },
          { key: 'widget_html', label: '배너/위젯 코드 (HTML 태그)', placeholder: '<a href="..."><img src="..."></a>', multiline: true },
        ]}
        renderPreview={(item) => <div dangerouslySetInnerHTML={{ __html: item.widget_html || '' }} />}
      />
    </div>
  );
}
