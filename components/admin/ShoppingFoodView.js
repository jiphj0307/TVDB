import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';
import { classifyProduct, TOP_ORDER } from '../../lib/foodClassifier';

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
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
      {TOP_ORDER.map(({ key, label }) => {
        const subMap = tree[key];
        if (!subMap) return null;
        const subKeys = Object.keys(subMap);
        return (
          <div key={key} style={S.card}>
            <div style={S.cardTitle}>{label}</div>
            {subKeys.map(sub => {
              const buckets = subMap[sub];
              const isFruit = key === 'fruit';
              const bucketKeys = Object.keys(buckets);
              return (
                <div key={sub} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f0f', marginBottom: 8 }}>{sub}</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isFruit ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
                    gap: 10,
                  }}>
                    {bucketKeys.map(bk => (
                      <div key={bk} style={S.row}>
                        {isFruit && <div style={{ fontWeight: 700, fontSize: 12, color: '#16a34a', marginBottom: 6 }}>{bk}</div>}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                          <tbody>
                            {buckets[bk].map(row => (
                              <tr key={row.id} style={{ borderBottom: '1px solid #eef6ee' }}>
                                <td style={{ padding: '3px 6px', width: 44, color: '#8aaa8a', whiteSpace: 'nowrap' }}>{mdKo(row.broadcast_date)}</td>
                                <td style={{ padding: '3px 6px', width: 70, color: '#8aaa8a', whiteSpace: 'nowrap' }}>{row.channel}</td>
                                <td style={{ padding: '3px 6px' }}>{row.product_name}</td>
                                <td style={{ padding: '3px 6px', width: 70, color: '#8aaa8a', textAlign: 'right', whiteSpace: 'nowrap' }}>{row.price || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {Object.keys(tree).length === 0 && <p style={{ color: '#8aaa8a' }}>분류된 상품이 없습니다.</p>}
    </div>
  );
}
