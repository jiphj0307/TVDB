
import Head from 'next/head';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';
import HealthArchiveView from '../components/HealthArchiveView';

// 원래는 admin.js 로그인 성공 시 저장되는 sessionStorage.tvdb_admin='1'인 사람만 볼 수 있게
// 막혀 있었는데, 2026-07-25 디버깅 편의를 위해 우선 그 제한을 풀었다(비밀번호 없이 누구나
// 접근 가능). 회차 삭제/분류수정/체크박스 같은 쓰기 동작 버튼은 여전히 이 화면에 그대로
// 노출되므로, 나중에 정식으로 공개할 거면 그 부분은 별도로 admin 여부에 따라 가릴지 다시
// 정해야 한다 — 지금은 "우선 풀어보자"는 임시 조치임.
export default function HealthPage() {
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
