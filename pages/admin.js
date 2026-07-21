import { useState, useEffect } from 'react';
import Head from 'next/head';
import AdminSidebar from '../components/admin/AdminSidebar';
import ProgramInfoPanel from '../components/admin/ProgramInfoPanel';
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

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('program_info');
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  useEffect(() => {
    if (sessionStorage.getItem('tvdb_admin') === '1') setAuthed(true);
    setLoading(false);
  }, []);

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
        <AdminSidebar activeTab={activeTab} onNav={setActiveTab} onLogout={handleLogout} />
        <main style={{ flex: 1, minWidth: 0, padding: '32px 28px 60px' }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            {activeTab === 'program_info' && <ProgramInfoPanel showToast={showToast} />}
          </div>
        </main>
      </div>
      <Toast msg={toast} />
    </>
  );
}
