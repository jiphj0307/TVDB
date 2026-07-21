import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

// lib/foodClassifier.js는 미리 정해둔 키워드 목록에 있는 품목만 인식한다. 완전히 새로운
// 품목(예: 겨울에 새로 나온 딸기, 처음 보는 건기식 성분)은 조용히 "미분류"로 빠져서 화면에
// 안 보이게 된다 — 탭이 저절로 생기진 않는다. 이 패널은 그 사각지대를 찾아주는 살아있는
// 작업메모장 역할: 원래 스크래핑 단계에서 이미 "식품" 계열로 태깅됐는데도(category 컬럼)
// food_top이 비어있는(분류기가 못 잡은) 상품을 모아 보여준다.
// 여기서 직접 "분류"(수동으로 과일/건기식/식품 + 품목명 지정)하거나 "제외"(식품 아님 처리)할
// 수 있다 — 코드를 고치지 않고도 즉시 그 상품이 공개 사이트(/food) 탭에 반영된다.
// "제외"는 실제 tvdb_shopping 행을 지우는 게 아니라 food_top='ignore'로 표시만 해서 이 목록에서
// 빠지게 하는 것 — 방송 기록 자체(TVDB의 아카이브 목적)는 그대로 보존된다.
const FOOD_LIKE_CATEGORIES = ['식품', '가공식품', '신선식품'];

// 스크래핑 단계에서 "식품"으로 잘못 태깅된 비식품(염색약/의료기기/가전 등). 분류기가 아무리
// 좋아져도 이건 식품이 아니라서 영영 안 잡히니, 여기서 미리 걸러서 목록을 깨끗하게 유지한다.
const NON_FOOD_NOISE_RE =
  /염색제|의료기기|선풍기|무릎.*지지|서큘레이터|안마|마사지기|텀블러|블렌더|믹서기|냄비|후라이팬|프라이팬|칼세트|타파웨어|저울|공기청정기|가습기|제습기|목걸이|팔찌|반지|귀걸이|26SS|배럴|데님|가디건|니트|원피스|자켓|티셔츠|셔츠|팬츠|배수구|세제|로봇청소기|커피머신|에스프레소\s?머신|착즙기|주서기|녹즙기|스텝퍼|보험|크림|앰플|마스크팩|클렌저|클렌징폼|샴푸|미스트|퍼퓸|토트백|음성증폭기|넥마스크|세럼|로션|립타투|아이크림|틴트|파운데이션|마스카라|립스틱|냉감매트|압축파우치|근육관절패치|관절패치|카바스/;

const TOP_OPTIONS = [
  { value: 'fruit', label: '🍑 과일' },
  { value: 'supplement', label: '💊 건기식' },
  { value: 'food', label: '🍚 식품' },
];

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 브라우저 기본 confirm() 대신 쓰는 모달 — window.confirm은 주소창 밑에 "tvdb-xxx.vercel.app 내용:"
// 같은 도메인이 노출되는 브라우저 UI라 사이트 안 화면처럼 안 보임.
function ConfirmModal({ message, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 22, maxWidth: 420, width: '100%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <p style={{ fontSize: 14, color: '#0f1f0f', marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ ...S.btnGhost, padding: '8px 18px', fontSize: 13 }}>취소</button>
          <button type="button" onClick={onConfirm} style={{ ...S.btn('#dc2626'), padding: '8px 18px', fontSize: 13 }}>제외</button>
        </div>
      </div>
    </div>
  );
}

export default function UnclassifiedReview({ showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 지금 분류 입력창을 펼친 product_name
  const [topChoice, setTopChoice] = useState('food');
  const [labelInput, setLabelInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // 제외 확인 모달 대상 product_name

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tvdb_shopping')
        .select('product_name, channel, category, broadcast_date')
        .eq('food_top', '')
        .in('category', FOOD_LIKE_CATEGORIES)
        .range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    setRows(all.filter(r => !NON_FOOD_NOISE_RE.test(r.product_name)));
    setLoading(false);
  }

  function removeFromList(productName) {
    setRows(prev => prev.filter(r => r.product_name !== productName));
    setEditing(null);
  }

  async function classifyItem(productName) {
    const label = labelInput.trim();
    if (!label) { showToast?.('❌ 품목명을 입력하세요'); return; }
    setBusy(true);
    const { error } = await supabase
      .from('tvdb_shopping')
      .update({
        food_top: topChoice,
        food_sub: label,
        food_province: topChoice === 'fruit' ? '지역 미상' : null,
        food_city: null,
      })
      .eq('product_name', productName)
      .eq('food_top', '');
    setBusy(false);
    if (error) { showToast?.('❌ 분류 실패: ' + error.message); return; }
    showToast?.(`✅ "${productName.slice(0, 20)}..." → ${label}로 분류 완료`);
    removeFromList(productName);
  }

  async function ignoreItem(productName) {
    setBusy(true);
    const { error } = await supabase
      .from('tvdb_shopping')
      .update({ food_top: 'ignore', food_sub: null, food_province: null, food_city: null })
      .eq('product_name', productName)
      .eq('food_top', '');
    setBusy(false);
    if (error) { showToast?.('❌ 제외 실패: ' + error.message); return; }
    showToast?.(`🗑️ "${productName.slice(0, 20)}..." 제외 완료`);
    removeFromList(productName);
  }

  const grouped = {};
  for (const r of rows) {
    grouped[r.product_name] ??= {
      product_name: r.product_name, category: r.category,
      channels: new Set(), count: 0, first: r.broadcast_date, last: r.broadcast_date,
    };
    const e = grouped[r.product_name];
    e.channels.add(r.channel);
    e.count += 1;
    if (r.broadcast_date < e.first) e.first = r.broadcast_date;
    if (r.broadcast_date > e.last) e.last = r.broadcast_date;
  }
  const items = Object.values(grouped).sort((a, b) => b.count - a.count);

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>🔍 미분류 검토</div>
      <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 12 }}>
        스크래핑 단계에서 이미 "식품/가공식품/신선식품"으로 태깅됐지만, 과일·건기식·식품 분류기(lib/foodClassifier.js)가
        아직 품목을 못 알아본 상품들입니다. "분류"를 눌러 직접 품목을 지정하거나, 식품이 아닌 게 섞여있으면 "제외"를
        누르세요 — 둘 다 코드 수정 없이 바로 반영됩니다("제외"는 방송 기록 자체는 지우지 않고 이 목록에서만 뺍니다).
      </p>
      {loading ? <p>불러오는 중...</p> : items.length === 0 ? (
        <p style={{ color: '#8aaa8a' }}>미분류 후보가 없습니다.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>총 {items.length}개</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #d1e8d1', color: '#4b6e4b' }}>
                <th style={{ padding: '4px 6px', width: 40, textAlign: 'right' }}>#</th>
                <th style={{ padding: '4px 6px' }}>상품명</th>
                <th style={{ padding: '4px 6px' }}>원래 카테고리</th>
                <th style={{ padding: '4px 6px', width: 60, textAlign: 'right' }}>채널수</th>
                <th style={{ padding: '4px 6px', width: 60, textAlign: 'right' }}>건수</th>
                <th style={{ padding: '4px 6px', width: 100, textAlign: 'right' }}>기간</th>
                <th style={{ padding: '4px 6px', width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <Fragment key={item.product_name}>
                  <tr style={{ borderBottom: '1px solid #eef6ee' }}>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{i + 1}</td>
                    <td style={{ padding: '4px 6px' }}>{item.product_name}</td>
                    <td style={{ padding: '4px 6px', color: '#8aaa8a' }}>{item.category}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{item.channels.size}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{item.count}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a', whiteSpace: 'nowrap' }}>
                      {item.first === item.last ? mdKo(item.first) : `${mdKo(item.first)}~${mdKo(item.last)}`}
                    </td>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      <button type="button" disabled={busy} onClick={() => {
                        if (editing === item.product_name) { setEditing(null); return; }
                        setEditing(item.product_name); setTopChoice('food'); setLabelInput('');
                      }} style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11.5, marginRight: 6 }}>분류</button>
                      <button type="button" disabled={busy} onClick={() => setConfirmTarget(item.product_name)}
                        style={{ ...S.btnGhost, padding: '3px 10px', fontSize: 11.5, color: '#dc2626', borderColor: '#f3c7c7' }}>제외</button>
                    </td>
                  </tr>
                  {editing === item.product_name && (
                    <tr style={{ background: '#f5f9f5' }}>
                      <td></td>
                      <td colSpan={6} style={{ padding: '8px 6px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select value={topChoice} onChange={e => setTopChoice(e.target.value)}
                            style={{ ...S.input, width: 130, padding: '6px 8px' }}>
                            {TOP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <input value={labelInput} onChange={e => setLabelInput(e.target.value)}
                            placeholder="품목명 (예: 토마토)" style={{ ...S.input, width: 160, padding: '6px 8px' }}
                            onKeyDown={e => { if (e.key === 'Enter') classifyItem(item.product_name); }} />
                          <button type="button" disabled={busy} onClick={() => classifyItem(item.product_name)}
                            style={{ ...S.btn(), padding: '6px 14px', fontSize: 12.5 }}>저장</button>
                          <span style={{ fontSize: 11.5, color: '#8aaa8a' }}>이 상품명과 일치하는 미분류 행 {item.count}건 전부에 적용됩니다</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
      <ConfirmModal
        message={confirmTarget ? `"${confirmTarget}"을(를) 미분류 목록에서 제외할까요? (방송 기록은 남고 이 목록에서만 빠집니다)` : null}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => { const t = confirmTarget; setConfirmTarget(null); ignoreItem(t); }}
      />
    </div>
  );
}
