import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { classifyProduct, TOP_ORDER } from '../lib/foodClassifier';

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function ProductTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '3px 6px', width: 44, color: '#888', whiteSpace: 'nowrap' }}>{mdKo(row.broadcast_date)}</td>
            <td style={{ padding: '3px 6px', width: 70, color: '#888', whiteSpace: 'nowrap' }}>{row.channel}</td>
            <td style={{ padding: '3px 6px' }}>{row.product_name}</td>
            <td style={{ padding: '3px 6px', width: 70, color: '#888', textAlign: 'right', whiteSpace: 'nowrap' }}>{row.price || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 과일 섹션: 하위 과일 종류를 ㄱㄴㄷ순 탭으로 전환하며 보여줌
function FruitSection({ label, subMap }) {
  const subKeys = useMemo(() => Object.keys(subMap).sort((a, b) => a.localeCompare(b, 'ko')), [subMap]);
  const [active, setActive] = useState(subKeys[0] || '');
  useEffect(() => {
    if (!subKeys.includes(active)) setActive(subKeys[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKeys.join(',')]);

  const buckets = subMap[active] || {};
  const bucketKeys = Object.keys(buckets);

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, borderBottom: '2px solid #222', paddingBottom: 6, marginBottom: 14 }}>{label}</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {subKeys.map(sub => (
          <button key={sub} onClick={() => setActive(sub)} style={{
            padding: '6px 14px', border: '1px solid #ccc', borderRadius: 6,
            background: active === sub ? '#222' : '#fff', color: active === sub ? '#fff' : '#222',
            cursor: 'pointer', fontSize: 13,
          }}>{sub}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {bucketKeys.map(bk => (
          <div key={bk} style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#444', marginBottom: 6 }}>{bk}</div>
            <ProductTable rows={buckets[bk]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 건기식 · 식품 섹션: 종류별로 쭉 나열
function FlatSection({ label, subMap }) {
  const subKeys = Object.keys(subMap);
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, borderBottom: '2px solid #222', paddingBottom: 6, marginBottom: 14 }}>{label}</h2>
      {subKeys.map(sub => (
        <div key={sub} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{sub}</div>
          <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
            <ProductTable rows={subMap[sub]['__flat__'] || []} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ShoppingFoodView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    // Supabase REST 기본 응답 한도(보통 1000행) 때문에 페이지네이션으로 끝까지 가져와야
    // tvdb_shopping 전체(현재 7천행대, 매일 증가)가 안 잘리고 다 들어온다.
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tvdb_shopping')
        .select('id, broadcast_date, time_start, channel, product_name, price')
        .range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    setRows(all);
    setLoading(false);
  }

  if (loading) return <p>불러오는 중...</p>;

  // top(과일/건기식/식품) -> sub(복숭아/유산균/수산물 등) -> [region for 과일] -> rows[]
  const tree = {};
  for (const row of rows) {
    const c = classifyProduct(row.product_name);
    if (!c) continue;
    tree[c.top] ??= {};
    tree[c.top][c.sub] ??= {};
    const bucketKey = c.top === 'fruit' ? c.region : '__flat__';
    tree[c.top][c.sub][bucketKey] ??= [];
    tree[c.top][c.sub][bucketKey].push(row);
  }
  for (const top of Object.keys(tree)) {
    for (const sub of Object.keys(tree[top])) {
      for (const bucket of Object.keys(tree[top][sub])) {
        tree[top][sub][bucket].sort((a, b) => {
          const da = a.broadcast_date + (a.time_start || '');
          const db = b.broadcast_date + (b.time_start || '');
          return da < db ? -1 : da > db ? 1 : 0;
        });
      }
    }
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        최근 수집된 전체 기간의 홈쇼핑 상품 중 과일 · 건강기능식품 · 식품만 골라 종류별로 묶어서 보여줍니다.
        같은 과일이라도 산지가 다르면 따로 표시하고, 각 묶음 안에서는 방송 날짜순으로 정렬했습니다.
      </p>
      {TOP_ORDER.map(({ key, label }) => {
        const subMap = tree[key];
        if (!subMap) return null;
        return key === 'fruit'
          ? <FruitSection key={key} label={label} subMap={subMap} />
          : <FlatSection key={key} label={label} subMap={subMap} />;
      })}
      {Object.keys(tree).length === 0 && <p style={{ color: '#888' }}>분류된 상품이 없습니다.</p>}
    </div>
  );
}
