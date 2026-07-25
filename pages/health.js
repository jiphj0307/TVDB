
import Head from 'next/head';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';
import HealthArchiveView from '../components/HealthArchiveView';
import { loadHealthData } from '../lib/loadHealthTree';

// food.js와 동일한 이유로(9천여 건을 방문할 때마다 브라우저에서 훑으면 느림) 여기서 서버가
// 미리 받아둔 걸 정적으로 내려준다(ISR, 10분마다 재생성) — disease_tags는 이미 SQL로
// 백필돼 있어서 loadFoodTree.js의 classifyNewRows() 같은 분류 단계 없이 그대로 읽기만 한다.
// 관리자 전용 제한은 2026-07-25 디버깅 편의를 위해 풀어둔 상태 유지(누구나 접근 가능).
export async function getStaticProps() {
  const { rows, infoRows } = await loadHealthData();
  return { props: { initialRows: rows, initialInfoRows: infoRows, generatedAt: new Date().toISOString() }, revalidate: 600 };
}

export default function HealthPage({ initialRows, initialInfoRows, generatedAt }) {
  const topSlot = useAdSlot('health_top');
  const bottomSlot = useAdSlot('health_bottom');
  const leftSlot = useAdSlot('health_left');
  const rightSlot = useAdSlot('health_right');

  return (
    <>
      <Head><title>건강 · 생활 · 먹거리 — TVDB</title></Head>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, maxWidth: 1440, margin: '0 auto', padding: '24px 16px' }}>
        <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
          <AdSlot slot="health_left" label="광고" slotData={leftSlot} />
        </div>

        <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, width: '100%', color: '#222' }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>TVDB</h1>
          <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>홈쇼핑·방송 편성 데이터 아카이브</p>

          <Nav />

          <div style={{ marginBottom: 20 }}>
            <AdSlot slot="health_top" label="광고" slotData={topSlot} />
          </div>

          <HealthArchiveView initialRows={initialRows} initialInfoRows={initialInfoRows} generatedAt={generatedAt} />

          <div style={{ marginTop: 24 }}>
            <AdSlot slot="health_bottom" label="광고" slotData={bottomSlot} />
          </div>

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 13 }}>
            <a href="/admin" style={{ color: '#888', textDecoration: 'none' }}>admin</a>
          </div>
        </div>

        <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
          <AdSlot slot="health_right" label="광고" slotData={rightSlot} />
        </div>

        <style jsx>{`
          @media (max-width: 1279px) {
            .tvdb-sidebar { display: none; }
          }
        `}</style>
      </div>
    </>
  );
}
