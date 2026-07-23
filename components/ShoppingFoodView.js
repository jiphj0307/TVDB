import { useEffect, useMemo, useState } from 'react';
import { TOP_ORDER } from '../lib/foodClassifier';

function mdKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// "신규" 뱃지는 이 기능을 배포한 날짜(ANCHOR_DATE) 이후에 처음 등장한 탭에만 붙인다.
// 그냥 "가장 오래된 방송일이 오늘 기준 7일 이내"로만 판정하면, 지금처럼 데이터 자체가
// 아직 10일치밖에 없는 초창기엔 원래 있던 품목까지 전부 "신규"로 잘못 뜬다 — 배포 시점을
// 기준으로 고정해야 그 이후 "진짜로 새로 나온" 품목만 잡힌다.
const ANCHOR_DATE = '2026-07-22';

// 탭 버튼에 "몇 개 채널 · 몇 회 방송"을 적어주기 위해, 중첩된 트리(과일은 province->city->rows,
// 건기식·식품은 __flat__->rows)를 상관없이 재귀로 훑어서 채널수/총 방송횟수를 세고,
// 오늘 방송된 게 하나라도 있는지, 이 탭이 처음 등장한 날짜(=가장 오래된 broadcast_date)도 같이
// 체크한다 — "오늘" 뱃지와 "신규"(ANCHOR_DATE 이후 처음 등장해서 7일 이내) 뱃지를 탭에 붙이기 위함.
function collectStats(node, today) {
  const channels = new Set();
  let count = 0;
  let hasToday = false;
  let first = null;
  (function walk(n) {
    if (Array.isArray(n)) {
      count += n.length;
      for (const r of n) {
        channels.add(r.channel);
        if (r.broadcast_date === today) hasToday = true;
        if (first === null || r.broadcast_date < first) first = r.broadcast_date;
      }
      return;
    }
    for (const k of Object.keys(n)) walk(n[k]);
  })(node);
  const isNew = first !== null && first >= ANCHOR_DATE && daysBetween(first, today) <= 7;
  return { channelCount: channels.size, count, hasToday, isNew };
}

function TabButton({ label, stats, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', padding: '6px 14px', border: '1px solid #ccc', borderRadius: 6,
      background: active ? '#222' : '#fff', color: active ? '#fff' : '#222',
      cursor: 'pointer', fontSize: 13, textAlign: 'center', lineHeight: 1.5,
    }}>
      {stats.hasToday && (
        <span style={{
          position: 'absolute', top: -8, right: -6, fontSize: 9.5, fontWeight: 700, color: '#fff',
          background: '#e63946', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
        }}>오늘</span>
      )}
      {stats.isNew && (
        <span style={{
          position: 'absolute', top: -8, left: -6, fontSize: 9.5, fontWeight: 700, color: '#fff',
          background: '#2563eb', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
        }}>신규</span>
      )}
      {label}
      <div style={{ fontSize: 10.5, opacity: 0.75 }}>{stats.channelCount}개 채널 · {stats.count}회</div>
    </button>
  );
}

// 같은 상품이 수량/구성만 바꿔서 여러 상품명으로 편성되는 경우가 많다.
// 건기식은 "...유산균(3박스)" / "...유산균(6박스)" / "...유산균 9박스 + 플러스 60포" 식이고,
// 과일은 "...햇복숭아 총 9kg" / "...햇복숭아 총 9kg (3kg*3box)" 식으로 무게·영문 단위·곱셈 구성이 섞여 나온다.
// product_name이 완전히 똑같은 것만 묶으면 이런 변형이 전부 별개 상품으로 갈라져 목록이 중복투성이로 보인다.
// 그래서 수량/구성을 나타내는 흔한 패턴(박스/주분/개월분/포/병/팩/세트/정/캡슐/입 등 한글 단위 + kg/g/box 같은
// 무게·영문 단위, "총 N단위", 맨 앞 대괄호 태그, "+ 플러스 N포" 식 추가구성, "(3kg*3box)" 식 괄호 안 곱셈 구성)을
// 떼어낸 "기준명"으로 다시 묶는다. 기준명이 우연히 같아지는 경우를 빼면, 실제로 성분·용량이 달라 숫자 뒤에
// 이 단위들이 안 붙는 경우(예: "2000IU")는 기준명이 달라져 잘못 합쳐지지 않는다.
const QTY_UNIT = '(?:박스|주분|개월분|개월|포|병|팩|세트|입|개|캡슐|정|스틱|알|매|box|kg|g)';
const QTY_ATOM = `\\d+\\s*${QTY_UNIT}`;
// 괄호 안이 "숫자+단위"만 *,x,×,+,콤마,공백으로 이어진 구성 설명이면(예: "(3kg*3box)") 통째로 제거
const QTY_GROUP = new RegExp(`\\(\\s*${QTY_ATOM}(?:\\s*[*x×+,]\\s*${QTY_ATOM})*\\s*\\)`, 'gi');
// 괄호 없이 단독으로 오거나("9박스", "총 9kg") 괄호 하나로만 감싼 단일 수량("(6박스)")도 제거
const QTY_TOKEN = new RegExp(`(?:총\\s*)?\\(?\\s*\\d+\\s*${QTY_UNIT}\\s*\\)?`, 'gi');
// "+ 플러스 60포"처럼 "+"뒤에 딸린 게 단순 문구뿐 아니라, "+열무김치 1kg"처럼 실제 보너스 상품명이
// 붙는 경우도 있다. "+" 바로 뒤부터 수량 단위가 나오는 지점까지(최대 20자, 상품명 없이 그냥
// "+ 60포"처럼 짧게 끝나는 경우도 포함) 통째로 지운다 — "+"만 지우고 보너스 상품명은 남기면
// 서로 다른 기준명이 되어 같은 상품끼리도 안 합쳐진다(2026-07-23 "해남 땅끝마을 쌍둥이네 김치
// 8kg+열무김치 1kg"이 "...김치" 단독 변형과 안 합쳐지던 버그).
const PLUS_TOKEN = new RegExp(`\\+[^+()]{0,20}?${QTY_ATOM}`, 'gi');
const BRACKET_PREFIX = /^(\[[^\]]{1,14}\]\s*)+/;

function baseName(name) {
  let s = name.replace(BRACKET_PREFIX, '');
  s = s.replace(QTY_GROUP, '');
  s = s.replace(PLUS_TOKEN, '');
  s = s.replace(QTY_TOKEN, '');
  s = s.replace(/[()]/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || name.trim();
}

// 상품명에서 기준명을 뺀 나머지(=수량/구성 차이)를 옵션 뱃지 라벨로 쓴다.
// 기준명이 안에 없으면(단어 순서가 달라 못 찾은 경우) 원래 상품명을 그대로 라벨로 쓴다.
function variantLabel(name, base) {
  const bracketMatch = name.match(BRACKET_PREFIX);
  const bracketPart = bracketMatch ? bracketMatch[0].trim() : '';
  let rest = name.replace(BRACKET_PREFIX, '');
  const idx = rest.indexOf(base);
  if (base && idx >= 0) {
    rest = rest.slice(0, idx) + rest.slice(idx + base.length);
  } else {
    return name;
  }
  rest = rest.replace(/^[\s()·,+-]+|[\s()·,+-]+$/g, '').trim();
  const label = [bracketPart, rest].filter(Boolean).join(' ').trim();
  return label || name;
}

// 1) product_name이 완전히 같은 것끼리 먼저 묶고(변형 단위),
// 2) 그 변형들을 baseName 기준으로 다시 묶어 하나의 상품 행으로 합친다.
// 변형이 하나뿐이면(=수량 차이로 갈라진 다른 행이 없으면) 원래 상품명을 그대로 보여주고,
// 여러 개면 기준명 + 옵션 뱃지(수량별 방송횟수)로 보여준다.
// 방송 횟수 많은 순으로 정렬 — 그게 "잘 팔리는" 신호 그 자체라서.
function aggregateByProduct(rows) {
  const variantMap = new Map();
  for (const r of rows) {
    let v = variantMap.get(r.product_name);
    if (!v) {
      v = { product_name: r.product_name, channels: new Set(), count: 0, last: r.broadcast_date, rows: [] };
      variantMap.set(r.product_name, v);
    }
    v.channels.add(r.channel);
    v.count += 1;
    v.rows.push(r);
    if (r.broadcast_date > v.last) v.last = r.broadcast_date;
  }

  const groups = new Map();
  for (const v of variantMap.values()) {
    const base = baseName(v.product_name);
    let g = groups.get(base);
    if (!g) {
      g = { base, channels: new Set(), count: 0, last: v.last, variants: [] };
      groups.set(base, g);
    }
    for (const ch of v.channels) g.channels.add(ch);
    g.count += v.count;
    if (v.last > g.last) g.last = v.last;
    g.variants.push({
      label: variantLabel(v.product_name, base),
      product_name: v.product_name,
      count: v.count,
      last: v.last,
      rows: v.rows,
    });
  }

  for (const g of groups.values()) {
    g.variants.sort((a, b) => b.count - a.count);
  }

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

// 상품명 클릭 시 언제·어디서 방송했는지 전체 내역을 보여주는 모달.
// 옵션(수량)이 여러 개로 묶인 상품이면 각 방송 행이 어떤 옵션이었는지 열을 하나 더 보여준다.
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
              {item.showVariantColumn && <th style={{ padding: '4px 6px', fontWeight: 600 }}>옵션</th>}
              <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>가격</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{mdKo(row.broadcast_date)}</td>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', color: '#888' }}>{row.time_start?.slice(0, 5) || ''}</td>
                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.channel}</td>
                {item.showVariantColumn && (
                  <td style={{ padding: '4px 6px', color: '#888', whiteSpace: 'nowrap' }}>{row._variantLabel}</td>
                )}
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
  const today = todayStr();
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
          {items.map(item => {
            const hasVariants = item.variants.length > 1;
            const displayName = hasVariants ? item.base : item.variants[0].product_name;
            const flatRows = item.variants.flatMap(v => v.rows.map(r => ({ ...r, _variantLabel: v.label })));
            return (
              <tr
                key={item.base}
                onClick={() => setSelected({
                  product_name: displayName,
                  channels: item.channels,
                  count: item.count,
                  rows: flatRows,
                  showVariantColumn: hasVariants,
                })}
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
              >
                <td style={{ padding: '3px 6px', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                  {item.last === today && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: '#e63946',
                      borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle',
                    }}>오늘</span>
                  )}
                  {hasVariants && (
                    <span style={{
                      marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap',
                    }}>옵션 {item.variants.length}개</span>
                  )}
                </td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888' }}>{item.channels.size}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888' }}>{item.count}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right', color: '#888', whiteSpace: 'nowrap' }}>{mdKo(item.last)}</td>
              </tr>
            );
          })}
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
    const today = todayStr();
    const m = {};
    for (const sub of Object.keys(subMap)) m[sub] = collectStats(subMap[sub], today);
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

  // 카드가 지역별로 여러 개 뜨면 화면이 길어져서, 카드별로 접었다 펼 수 있게 한다.
  // 접힌 카드도 헤더에 채널수·방송횟수는 계속 보이니 접었다고 정보가 사라지진 않는다.
  const [collapsed, setCollapsed] = useState(() => new Set());
  function toggleCollapsed(province) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(province)) next.delete(province); else next.add(province);
      return next;
    });
  }

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
          const stats = collectStats(cities, todayStr());
          const isCollapsed = collapsed.has(province);
          return (
            <div key={province} style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
              <div
                onClick={() => toggleCollapsed(province)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', marginBottom: isCollapsed ? 0 : 8, userSelect: 'none',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: '#222' }}>
                  <span style={{ display: 'inline-block', width: 14, color: '#999' }}>{isCollapsed ? '▶' : '▼'}</span>
                  {province}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>{stats.channelCount}개 채널 · {stats.count}회</div>
              </div>
              {!isCollapsed && (
                onlyFlat ? (
                  <AggregatedTable rows={cities.__flat__} />
                ) : (
                  cityKeys.map(city => (
                    <div key={city} style={{ marginBottom: 8 }}>
                      {city !== '__flat__' && <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>{city}</div>}
                      <AggregatedTable rows={cities[city]} />
                    </div>
                  ))
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 건기식 · 식품 섹션: 과일과 동일하게 하위 종류를 방송횟수 많은 순 탭으로 전환, 카드도 동일하게 접을 수 있게 함
function FlatSection({ label, subMap }) {
  const subStats = useMemo(() => {
    const today = todayStr();
    const m = {};
    for (const sub of Object.keys(subMap)) m[sub] = collectStats(subMap[sub], today);
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

  // 과일 탭의 지역 카드와 동일하게, 여기 카드도 접었다 펼 수 있어야 한다 — 카드가 하나뿐이라고
  // 접을 필요가 없는 게 아니라, 내용을 확인한 뒤 치워두고 싶을 수 있다. 탭(sub)마다 접힘 상태를
  // 따로 기억한다.
  const [collapsed, setCollapsed] = useState(() => new Set());
  function toggleCollapsed(sub) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub); else next.add(sub);
      return next;
    });
  }
  const isCollapsed = collapsed.has(active);

  const rows = subMap[active]?.__flat__ || [];
  const stats = subStats[active] || { channelCount: 0, count: 0 };

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, borderBottom: '2px solid #222', paddingBottom: 6, marginBottom: 14 }}>{label}</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {subKeys.map(sub => (
          <TabButton key={sub} label={sub} stats={subStats[sub]} active={active === sub} onClick={() => setActive(sub)} />
        ))}
      </div>
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
        <div
          onClick={() => toggleCollapsed(active)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', marginBottom: isCollapsed ? 0 : 8, userSelect: 'none',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: '#222' }}>
            <span style={{ display: 'inline-block', width: 14, color: '#999' }}>{isCollapsed ? '▶' : '▼'}</span>
            {active}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>{stats.channelCount}개 채널 · {stats.count}회</div>
        </div>
        {!isCollapsed && <AggregatedTable rows={rows} />}
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
