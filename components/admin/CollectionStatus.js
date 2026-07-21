import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

// "어디까지 스크래핑됐는지"를 세션(대화) 기억이나 사람 손에 의존하지 않고, tvdb_shopping에
// 실제로 들어간 데이터 자체에서 뽑아낸다 — INSERT가 곧 진행상황 기록이라 별도 추적 테이블이
// 둘 새 없이 어긋날 일이 없다. 채널별 "마지막 수집일"이 오늘/어제보다 오래된 순으로 정렬해서,
// 어느 세션에서 이어서 하든 바로 "여기부터 하면 된다"를 알 수 있게 한다.
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBehind(dateStr, today) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export default function CollectionStatus() {
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
        .select('channel, broadcast_date')
        .range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    setRows(all);
    setLoading(false);
  }

  const today = todayStr();
  const byChannel = {};
  for (const r of rows) {
    byChannel[r.channel] ??= { channel: r.channel, min: r.broadcast_date, max: r.broadcast_date, count: 0 };
    const e = byChannel[r.channel];
    if (r.broadcast_date < e.min) e.min = r.broadcast_date;
    if (r.broadcast_date > e.max) e.max = r.broadcast_date;
    e.count += 1;
  }
  const items = Object.values(byChannel).sort((a, b) => a.max < b.max ? -1 : a.max > b.max ? 1 : 0);

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>📊 채널별 수집 현황</div>
      <p style={{ fontSize: 12, color: '#8aaa8a', marginTop: -8, marginBottom: 12 }}>
        각 채널이 실제로 어느 날짜까지 수집돼 있는지 tvdb_shopping 데이터에서 그대로 보여줍니다.
        오래된(뒤처진) 채널이 위로 오도록 정렬했으니, 다음에 스크래핑할 땐 여기 위쪽 채널부터
        "마지막 수집일 다음날"부터 이어서 하면 됩니다.
      </p>
      {loading ? <p>불러오는 중...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #d1e8d1', color: '#4b6e4b' }}>
              <th style={{ padding: '4px 6px' }}>채널</th>
              <th style={{ padding: '4px 6px' }}>보유 기간</th>
              <th style={{ padding: '4px 6px', width: 70, textAlign: 'right' }}>건수</th>
              <th style={{ padding: '4px 6px', width: 90, textAlign: 'right' }}>마지막 수집일</th>
              <th style={{ padding: '4px 6px', width: 80, textAlign: 'right' }}>뒤처짐</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const behind = daysBehind(item.max, today);
              return (
                <tr key={item.channel} style={{ borderBottom: '1px solid #eef6ee' }}>
                  <td style={{ padding: '4px 6px', fontWeight: 600 }}>{item.channel}</td>
                  <td style={{ padding: '4px 6px', color: '#8aaa8a' }}>{item.min} ~ {item.max}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: '#8aaa8a' }}>{item.count}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{item.max}</td>
                  <td style={{
                    padding: '4px 6px', textAlign: 'right', fontWeight: 700,
                    color: behind >= 2 ? '#dc2626' : behind === 1 ? '#d97706' : '#16a34a',
                  }}>
                    {behind <= 0 ? '오늘까지' : `${behind}일 전`}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: '#8aaa8a' }}>데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
