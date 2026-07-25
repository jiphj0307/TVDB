
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: '홈쇼핑 · 편성표' },
  { href: '/program', label: '📺 일반방송' },
  { href: '/food', label: '🍑 과일 · 건기식 · 식품', adminOnly: true },
  { href: '/health', label: '🩺 건강 · 생활 · 먹거리', adminOnly: true },
];

export function Nav() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  // program.js와 동일하게 admin.js 로그인 성공 시 sessionStorage.tvdb_admin='1'로 판단
  useEffect(() => {
    setIsAdmin(sessionStorage.getItem('tvdb_admin') === '1');
  }, []);

  const links = LINKS.filter(l => !l.adminOnly || isAdmin);

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {links.map(({ href, label }) => {
        const active = router.pathname === href;
        return (
          <Link key={href} href={href} style={{
            padding: '8px 14px', border: '1px solid #ccc', borderRadius: 6,
            background: active ? '#222' : '#fff', color: active ? '#fff' : '#222',
            textDecoration: 'none', fontSize: 14,
          }}>{label}</Link>
        );
      })}
    </div>
  );
}
