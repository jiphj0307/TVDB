import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { S } from './AdminUI';

// 홈쇼핑 쪽 CollectionStatus.js와 동일한 원리: tvdb_program에 실제로 들어간 데이터에서
// 채널별 "마지막 수집일"을 그대로 뽑아내서 보여준다. 별도 진행상황 테이블 없이 INSERT
// 자체가 진행기록이라 어긋날 일이 없다. 뒤처진 채널이 위로 오도록 정렬.
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBehind(dateStr, today) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

const CLAUDE_COMMAND =
  'TVDB MCP 접속해서 tvdb_program 테이블에서 채널별 마지막 수집일 확인하고, tvdb_channel_notes에 저장된 채널별 수집방법 참고해서 뒤처진 채널부터 바로 이어서 편성표 스크래핑해서 tvdb_program에 채워줘.';

export default function BroadcastCollectionStatus() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); }, []);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(CLAUDE_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('복사가 안 되면 아래 텍스트를 직접 선택해서 복사하세요:', CLAUDE_COMMAND);
    }
  }

  async function load() {
    setLoading(true);
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tvdb_program')
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
        각 채널이 실제로 어느 날짜까지 수집돼 있는지 tvdb_program 데이터에서 그대로 보여줍니다.
        오래된(뒤처진) 채널이 위로 오도록 정렬했으니, 다음에 수집할 땐 여기 위쪽 채널부터
        "마지막 수집일 다음날"부터 이어서 하면 됩니다.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button type="button" onClick={copyCommand} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12 }}>
          📋 클로드에게 전달할 명령 복사
        </button>
        {copied && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>✅ 복사됨 — 새 대화에 붙여넣으세요</span>}
      </div>
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
