import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// 광고 슬롯 설정 + 쿠팡 배너/위젯 목록을 앱 전체에서 한 번만 불러와 공유 (프레시시즌 AdSlotsContext와 동일한 역할, Supabase 직접호출로 구현)
const AdSlotsContext = createContext({ slots: {}, coupangWidgets: [], loading: true });

export function AdSlotsProvider({ children }) {
  const [slots, setSlots] = useState({});
  const [coupangWidgets, setCoupangWidgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: settingsRow } = await supabase.from('tvdb_settings').select('value').eq('key', 'ad_slots').maybeSingle();
      let list = [];
      try { list = settingsRow?.value ? JSON.parse(settingsRow.value) : []; } catch { list = []; }
      const map = {};
      list.forEach(s => { map[s.id] = s; });
      setSlots(map);

      const { data: widgets } = await supabase.from('tvdb_coupang_widgets').select('*').eq('enabled', true);
      setCoupangWidgets(widgets || []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AdSlotsContext.Provider value={{ slots, coupangWidgets, loading }}>
      {children}
    </AdSlotsContext.Provider>
  );
}

export function useAdSlot(id) {
  const { slots } = useContext(AdSlotsContext);
  return slots[id] || null;
}

export function useCoupangWidgets() {
  const { coupangWidgets } = useContext(AdSlotsContext);
  return coupangWidgets;
}

export function useAdSlots() {
  return useContext(AdSlotsContext);
}
