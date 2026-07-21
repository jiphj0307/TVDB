const NAV = [
  { id: 'program_info', label: '프로그램 정보 관리', icon: '📺' },
]

function NavItem({ item, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 20px', background: active ? '#dcfce7' : 'none',
      border: 'none', borderLeft: active ? '3px solid #16a34a' : '3px solid transparent',
      color: active ? '#15803d' : '#4b6e4b',
      fontSize: 14, fontWeight: active ? 700 : 500,
      cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
      fontFamily: "'Outfit', sans-serif",
    }}>
      <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
    </button>
  )
}

export default function AdminSidebar({ activeTab, onNav, onLogout }) {
  return (
    <aside style={{
      width: 220, minWidth: 220, background: '#fff',
      borderRight: '1px solid #d1e8d1',
      display: 'flex', flexDirection: 'column', height: '100vh',
      position: 'sticky', top: 0, overflow: 'hidden',
    }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #d1e8d1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#16a34a,#22c55e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📡</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1f0f' }}>Admin Panel</div>
            <div style={{ fontSize: 11, color: '#8aaa8a', marginTop: 2 }}>TVDB</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={activeTab === item.id} onClick={() => onNav(item.id)} />
        ))}
      </nav>
      <div style={{ padding: '12px 20px', borderTop: '1px solid #d1e8d1', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <a href="/" style={{ color: '#4b6e4b', fontSize: 13, textDecoration: 'none', padding: '6px 0' }}>← 사이트로</a>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b6e4b', fontSize: 14, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Outfit', sans-serif" }}>
          <span>🚪</span> 로그아웃
        </button>
      </div>
    </aside>
  )
}
