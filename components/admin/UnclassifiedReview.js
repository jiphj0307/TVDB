import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

// lib/foodClassifier.js는 미리 정해둔 키워드 목록에 있는 품목만 인식한다. 완전히 새로운
// 품목(예: 겨울에 새로 나온 딸기, 처음 보는 건기식 성분)은 조용히 "미분류"로 빠져서 화면에
// 안 보이게 된다 — 탭이 저절로 생기진 않는다. 이 패널은 그 사각지대를 찾아주는 살아있는
// 작업메모장 역할: 원래 스크래핑 단계에서 이미 "식품" 계열로 태깅됐는데도(category 컬럼)
// food_top이 비어있는(분류기가 못 잡은) 상품을 모아 보여준다. 여기 뜨는 상품명을 보고
// lib/foodClassifier.js에 키워드를 추가하면 다음 재분류 때부터 잡힌다.
const FOOD_LIKE_CATEGORIES = ['식품', '가공식품', '신선식품'];

// 스크래핑 단계에서 "식품"으로 잘못 태깅된 비식품(염색약/의료기기/가전 등). 분류기가 아무리
// 좋아져도 이건 식품이 아니라서 영영 안 잡히니, 여기서 미리 걸러서 목록을 깨끗하게 유지한다.
const NON_FOOD_NOISE_RE =
  /염색제|의료기기|선풍기|무릎.*지지|서큘레이터|안마|마사지기|텀블러|블렌더|믹서기|냄비|후라이팬|프라이팬|칼세트|타파웨어|저울|공기청정기|가습기|제습기|목걸이|팔찌|반지|귀걸이|26SS|배럴|데님|가디건|니트|원피스|자켓|티셔츠|셔츠|팬츠|배수구|세제|로봇청소기|커피머신|에스프레소\s?머신|착즙기|주서기|녹즙기|스텝퍼|보험|크림|앰플|마스크팩|클렌저|클렌징폼|샴푸|미스트|퍼퓸|토트백|음성증폭기|넥마스크|세럼|로션|립타투|아이크림|틴트|파운데이션|마스카라|립스틱/;

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function UnclassifiedReview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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
        아직 품목을 못 알아본 상품들입니다. 새 품목이 계속 나오면 여기 쌓이니, 주기적으로 확인해서 분류기에 키워드를
        추가해주세요. (염색제·의료기기·가전처럼 애초에 식품이 아닌 건 미리 걸러서 안 보이게 했습니다.)
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
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.product_name} style={{ borderBottom: '1px solid #eef6ee' }}>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{i + 1}</td>
                  <td style={{ padding: '4px 6px' }}>{item.product_name}</td>
                  <td style={{ padding: '4px 6px', color: '#8aaa8a' }}>{item.category}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{item.channels.size}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{item.count}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a', whiteSpace: 'nowrap' }}>
                    {item.first === item.last ? mdKo(item.first) : `${mdKo(item.first)}~${mdKo(item.last)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
