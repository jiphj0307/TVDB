
import Link from 'next/link';
import { useRouter } from 'next/router';

const LINKS = [
  { href: '/', label: '홈쇼핑 · 편성표' },
  { href: '/program', label: '📺 일반방송' },
  { href: '/food', label: '🍑 과일 · 건기식 · 식품' },
];

export function Nav() {
  const router = useRouter();
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {LINKS.map(({ href, label }) => {
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
