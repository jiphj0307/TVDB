import { useEffect, useMemo, useState } from 'react';
import { TOP_ORDER } from '../lib/foodClassifier';

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 탭 버튼에 "몇 개 채널 · 몇 회 방송"을 적어주기 위해, 중첩된 트리(과일은 province->city->rows,
// 건기식·식품은 __flat__->rows)를 상관없이 재귀로 훑어서 채널수/총 방송횟수를 센다.
function collectStats(node) {
  const channels = new Set();
  let count = 0;
  (function walk(n) {
    if (Array.isArray(n)) {
      count += n.length;
      for (const r of n) channels.add(r.channel);
      return;
    }
    for (const k of Object.keys(n)) walk(n[k]);
  })(node);
  return { channelCount: channels.size, count };
}

function TabButton({ label, stats, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', border: '1px solid #ccc', borderRadius: 6,
      background: active ? '#222' : '#fff', color: active ? '#fff' : '#222',
      cursor: 'pointer', fontSize: 13, textAlign: 'center', lineHeight: 1.5,
    }}>
      {label}
      <div style={{ fontSize: 10.5, opacity: 0.75 }}>{stats.channelCount}개 채널 · {stats.count}회</div>
    </button>
  );
}

// 같은 상품이 여러 채널·날짜에 걸쳐 반복 편성되는 게 보통이라(=잘 팔린다는 신호),
// 행을 그대로 나열하지 않고 상품명 기준으로 묶어서 "몇 개 채널에서 몇 번 팔렸는지"만 보여준다.
// 방송 횟수 많은 순으로 정렬 — 그게 "잘 팔리는" 신호 그 자체라서.
function aggregateByProduct(rows) {
  const map = new Map();
  for (const r of rows) {
    let e = map.get(r.product_name);
    if (!e) {
      e = { product_name: r.product_name, channels: new Set(), count: 0, last: r.broadcast_date, rows: [] };
      map.set(r.product_name, e);
    }
    e.channels.add(r.channel);
    e.count += 1;
    e.rows.push(r);
    if (r.broadcast_date > e.last) e.last = r.broadcast_date;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// 상품명 클릭 시 언제·어디서 방송했는지 전체 내역을 보여주는 모달
function DetailModal({ item, onClose }) {
  if (!item) return null;
  const sorted = [...item.rows].sort((a, b) => {
    const da = a.broadcast_date + (a.time_start || '');
    const db = b.broadcast_date + (b.time_start || '');
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 10, padding: 20, maxWidth: 560, width: '100%',
        maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{item.product_name}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 12 }}>
          {item.channels.size}개 채널 · 총 {item.count}회 방송
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc', color: '#888' }}>
              <th style={{ padding: '4px 6px', fontWeight: 600 }}>날짜</th>
              <th style={{ padding: '4px 6px', fontWeight: 600 }}>시간</th>
              <th style={{ padding: '4px 6px', fontWeight: 600 }}>채널</th>
              <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>가격</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{mdKo(row.broadcast_date)}</td>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', color: '#888' }}>{row.time_start?.slice(0, 5) || ''}</td>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.channel}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: '#888', whiteSpace: 'nowrap' }}>{row.price || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AggregatedTable({ rows }) {
  const items = useMemo(() => aggregateByProduct(rows), [rows]);
  const [selected, setSelected] = useState(null);
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc', color: '#888' }}>
            <th style={{ padding: '3px 6px', fontWeight: 600 }}>상품명</th>
            <th style={{ padding: '3px 6px', width: 56, textAlign: 'right', fontWeight: 600 }}>채널수</th>
            <th style={{ padding: '3px 6px', width: 56, textAlign: 'right', fontWeight: 600 }}>방송횟수</th>
            <th style={{ padding: '3px 6px', width: 48, textAlign: 'right', fontWeight: 600 }}>최근</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.product_name} onClick={() => setSelected(item)} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}>
              <td style={{ padding: '3px 6px' }}>{item.product_name}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888' }}>{item.channels.size}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888' }}>{item.count}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888', whiteSpace: 'nowrap' }}>{mdKo(item.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <DetailModal item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// 과일 섹션: 하위 과일 종류를 방송횟수 많은 순 탭으로 전환, 그 안에서 도(province) 단위로 한 카드씩 묶고
// 시/군(city)을 아는 경우엔 그 카드 안에 소제목으로만 구분한다 (예: "경북" 카드 하나 안에 의성/영천/상주 소제목).
function FruitSection({ label, subMap }) {
  const subStats = useMemo(() => {
    const m = {};
    for (const sub of Object.keys(subMap)) m[sub] = collectStats(subMap[sub]);
    return m;
  }, [subMap]);
  // 방송횟수(=관심·판매량 신호) 많은 순으로 탭 정렬 — 가나다순 대신 동적으로 매겨진다
  const subKeys = useMemo(
    () => Object.keys(subMap).sort((a, b) => subStats[b].count - subStats[a].count),
    [subMap, subStats]
  );
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
          <TabButton key={sub} label={sub} stats={subStats[sub]} active={active === sub} onClick={() => setActive(sub)} />
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
                <AggregatedTable rows={cities.__flat__} />
              ) : (
                cityKeys.map(city => (
                  <div key={city} style={{ marginBottom: 8 }}>
                    {city !== '__flat__' && <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>{city}</div>}
                    <AggregatedTable rows={cities[city]} />
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

// 건기식 · 식품 섹션: 과일과 동일하게 하위 종류를 방송횟수 많은 순 탭으로 전환
function FlatSection({ label, subMap }) {
  const subStats = useMemo(() => {
    const m = {};
    for (const sub of Object.keys(subMap)) m[sub] = collectStats(subMap[sub]);
    return m;
  }, [subMap]);
  // 방송횟수(=관심·판매량 신호) 많은 순으로 탭 정렬 — 가나다순 대신 동적으로 매겨진다
  const subKeys = useMemo(
    () => Object.keys(subMap).sort((a, b) => subStats[b].count - subStats[a].count),
    [subMap, subStats]
  );
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
          <TabButton key={sub} label={sub} stats={subStats[sub]} active={active === sub} onClick={() => setActive(sub)} />
        ))}
      </div>
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
        <AggregatedTable rows={rows} />
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
        같은 상품이 여러 채널·날짜에 반복 편성되는 건 그만큼 잘 팔린다는 신호라 행으로 나열하지 않고
        상품명 기준으로 묶어서 채널수·방송횟수로 보여주고, 방송횟수가 많은 순으로 정렬했습니다.
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
