
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';
import HealthArchiveView from '../components/HealthArchiveView';

// food.js와 동일하게 admin.js 로그인 성공 시 저장되는 sessionStorage.tvdb_admin='1'인
// 사람만 볼 수 있다. 데이터가 tvdb_program_episodes에서 클라이언트가 직접 조회하는
// 구조라 getStaticProps는 필요 없음(무거운 분류 작업이 없는 단순 집계라서).
export default function HealthPage() {
  const router = useRouter();
  const topSlot = useAdSlot('health_top');
  const bottomSlot = useAdSlot('health_bottom');
  const leftSlot = useAdSlot('health_left');
  const rightSlot = useAdSlot('health_right');

  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const ok = sessionStorage.getItem('tvdb_admin') === '1';
    setIsAdmin(ok);
    setChecked(true);
    if (!ok) router.replace('/');
  }, [router]);

  if (!checked || !isAdmin) return null;

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

          <HealthArchiveView />

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
