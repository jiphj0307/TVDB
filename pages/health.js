import Head from 'next/head';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';
import HealthArchiveView from '../components/HealthArchiveView';
import { loadHealthData } from '../lib/loadHealthTree';

// 원래 ISR(1시간 캐시)이었으나, 체크박스(블로그/영상확인/클립확인)를 누른 직후 브라우저를
// 그냥 새로고침(F5)하면 최대 1시간 전 스냅샷이 다시 보여서 "체크한 게 사라졌다"로 오인되는
// 문제가 있었다(2026-07-26, 실제로는 저장은 매번 정상적으로 되고 있었음 — 캐시만 문제).
// 매 요청마다 직접 조회(SSR)로 바꿔서 새로고침해도 항상 DB의 최신 상태 그대로 보이게 한다.
// 9천여 건을 매번 서버에서 다시 훑긴 하지만 관리자용 내부 페이지라 트래픽이 낮아 괜찮다.
export async function getServerSideProps() {
  const { rows, infoRows } = await loadHealthData();
  return { props: { initialRows: rows, initialInfoRows: infoRows, generatedAt: new Date().toISOString() } };
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
