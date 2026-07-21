import { useEffect, useMemo, useState } from 'react';
import { TOP_ORDER } from '../lib/foodClassifier';

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

// 과일 섹션: 하위 과일 종류를 ㄱㄴㄷ순 탭으로 전환, 그 안에서 도(province) 단위로 한 카드씩 묶고
// 시/군(city)을 아는 경우엔 그 카드 안에 소제목으로만 구분한다 (예: "경북" 카드 하나 안에 의성/영천/상주 소제목).
function FruitSection({ label, subMap }) {
  const subKeys = useMemo(() => Object.keys(subMap).sort((a, b) => a.localeCompare(b, 'ko')), [subMap]);
  const [active, setActive] = useState(subKeys[0] || '');
  useEffect(() => {
    if (!subKeys.includes(active)) setActive(subKeys[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKeys.join(',')]);

  const provinces = subMap[active] || {};
  const provinceKeys = Object.keys(provinces);

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
        {provinceKeys.map(province => {
          const cities = provinces[province];
          const cityKeys = Object.keys(cities);
          const onlyFlat = cityKeys.length === 1 && cityKeys[0] === '__flat__';
          return (
            <div key={province} style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#222', marginBottom: 8 }}>{province}</div>
              {onlyFlat ? (
                <ProductTable rows={cities.__flat__} />
              ) : (
                cityKeys.map(city => (
                  <div key={city} style={{ marginBottom: 8 }}>
                    {city !== '__flat__' && <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>{city}</div>}
                    <ProductTable rows={cities[city]} />
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 건기식 · 식품 섹션: 과일과 동일하게 하위 종류를 ㄱㄴㄷ순 탭으로 전환
function FlatSection({ label, subMap }) {
  const subKeys = useMemo(() => Object.keys(subMap).sort((a, b) => a.localeCompare(b, 'ko')), [subMap]);
  const [active, setActive] = useState(subKeys[0] || '');
  useEffect(() => {
    if (!subKeys.includes(active)) setActive(subKeys[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKeys.join(',')]);

  const rows = subMap[active]?.__flat__ || [];

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
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
        <ProductTable rows={rows} />
      </div>
    </div>
  );
}

// tree는 pages/food.js의 getStaticProps(lib/loadFoodTree.js)에서 서버가 미리 분류해 내려준다.
// 여기서 다시 tvdb_shopping 전체를 브라우저에서 훑지 않는다 — 그게 로딩이 느렸던 원인이었음.
export default function ShoppingFoodView({ tree }) {
  const topKeys = Object.keys(tree || {});

  return (
    <div>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        최근 수집된 전체 기간의 홈쇼핑 상품 중 과일 · 건강기능식품 · 식품만 골라 종류별로 묶어서 보여줍니다.
        과일은 도 단위로 묶고(같은 경북이어도 시/군을 알면 카드 안에 소제목으로 구분), 각 묶음 안에서는 방송 날짜순으로 정렬했습니다.
      </p>
      {TOP_ORDER.map(({ key, label }) => {
        const subMap = tree?.[key];
        if (!subMap) return null;
        return key === 'fruit'
          ? <FruitSection key={key} label={label} subMap={subMap} />
          : <FlatSection key={key} label={label} subMap={subMap} />;
      })}
      {topKeys.length === 0 && <p style={{ color: '#888' }}>분류된 상품이 없습니다.</p>}
    </div>
  );
}
