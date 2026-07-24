
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { useAdSlot } from '../lib/AdSlotsContext';
import { Nav } from '../components/Nav';
import ShoppingFoodView from '../components/ShoppingFoodView';
import { loadFoodTree } from '../lib/loadFoodTree';

// tvdb_shopping 전체를 훑어서 분류하는 건 무거운 작업이라 방문할 때마다 브라우저에서
// 하지 않고, 여기서 서버가 미리 만들어둔 걸 정적으로 내려준다(ISR, 10분마다 재생성).
export async function getStaticProps() {
  const tree = await loadFoodTree();
  return { props: { tree }, revalidate: 600 };
}

export default function FoodPage({ tree }) {
  const router = useRouter();
  const topSlot = useAdSlot('food_top');
  const bottomSlot = useAdSlot('food_bottom');
  const leftSlot = useAdSlot('food_left');
  const rightSlot = useAdSlot('food_right');

  // 이 페이지는 admin.js 로그인 성공 시 저장되는 sessionStorage.tvdb_admin='1'인 사람만 볼 수 있다.
  // getStaticProps는 서버에서 미리 렌더링되므로 sessionStorage를 여기서 못 읽어 클라이언트에서 체크한다.
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
      <Head><title>과일 · 건기식 · 식품 — TVDB</title></Head>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, maxWidth: 1440, margin: '0 auto', padding: '24px 16px' }}>
        <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
          <AdSlot slot="food_left" label="광고" slotData={leftSlot} />
        </div>

        <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, width: '100%', color: '#222' }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>TVDB</h1>
          <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>홈쇼핑·방송 편성 데이터 아카이브</p>

          <Nav />

          <div style={{ marginBottom: 20 }}>
            <AdSlot slot="food_top" label="광고" slotData={topSlot} />
          </div>

          <ShoppingFoodView tree={tree} />

          <div style={{ marginTop: 24 }}>
            <AdSlot slot="food_bottom" label="광고" slotData={bottomSlot} />
          </div>

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 13 }}>
            <a href="/admin" style={{ color: '#888', textDecoration: 'none' }}>admin</a>
          </div>
        </div>

        <div className="tvdb-sidebar" style={{ flexShrink: 0, width: 160, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
          <AdSlot slot="food_right" label="광고" slotData={rightSlot} />
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
