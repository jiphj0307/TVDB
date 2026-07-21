import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AdminSidebar from '../components/admin/AdminSidebar';
import BroadcastPanel from '../components/admin/BroadcastPanel';
import ShoppingPanel from '../components/admin/ShoppingPanel';
import CoupangPanel from '../components/admin/CoupangPanel';
import AdsensePanel from '../components/admin/AdsensePanel';
import { S, Toast } from '../components/admin/AdminUI';

function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (pw === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      sessionStorage.setItem('tvdb_admin', '1');
      onLogin();
    } else {
      setErr('비밀번호가 틀렸습니다');
      setTimeout(() => setErr(''), 2000);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f9f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ background: '#ffffff', border: '1px solid #d1e8d1', borderRadius: 14, padding: 40, width: 360 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, background: '#16a34a', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>📡</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f1f0f' }}>Admin</h1>
          <p style={{ color: '#4b6e4b', fontSize: 14, marginTop: 4 }}>TVDB 관리자</p>
        </div>
        <form onSubmit={submit}>
          <input type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)}
            style={{ ...S.input, borderColor: err ? '#f87171' : '#d1e8d1', marginBottom: 8 }} />
          {err && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>{err}</p>}
          <button type="submit" style={{ ...S.btn(), width: '100%', marginTop: 8 }}>로그인</button>
        </form>
      </div>
    </div>
  );
}

const VALID_TABS = ['broadcast', 'shopping', 'coupang', 'adsense'];

export default function Admin() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('broadcast');
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  useEffect(() => {
    if (sessionStorage.getItem('tvdb_admin') === '1') setAuthed(true);
    setLoading(false);
  }, []);

  // 새로고침해도 어느 탭(일반방송/홈쇼핑/쿠팡/광고)에 있었는지 유지
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.tab;
    if (VALID_TABS.includes(q)) setActiveTab(q);
  }, [router.isReady, router.query.tab]);

  function navTo(tabId) {
    setActiveTab(tabId);
    router.replace({ pathname: '/admin', query: { tab: tabId } }, undefined, { shallow: true });
  }

  const handleLogout = () => {
    sessionStorage.removeItem('tvdb_admin');
    setAuthed(false);
  };

  if (loading) return null;
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <>
      <Head><title>Admin — TVDB</title></Head>
      <div style={{ minHeight: '100vh', background: '#f5f9f5', fontFamily: "'Outfit', sans-serif", color: '#0f1f0f', display: 'flex' }}>
        <AdminSidebar activeTab={activeTab} onNav={navTo} onLogout={handleLogout} />
        <main style={{ flex: 1, minWidth: 0, padding: '32px 28px 60px' }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            {activeTab === 'broadcast' && <BroadcastPanel showToast={showToast} />}
            {activeTab === 'shopping' && <ShoppingPanel showToast={showToast} />}
            {activeTab === 'coupang' && <CoupangPanel />}
            {activeTab === 'adsense' && <AdsensePanel showToast={showToast} />}
          </div>
        </main>
      </div>
      <Toast msg={toast} />
    </>
  );
}
