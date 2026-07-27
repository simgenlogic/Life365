import { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { SURFACES, type SurfaceId } from './navigation';
import { DashboardScreen } from './screens/DashboardScreen';
import { CatchUpScreen } from './screens/CatchUpScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { PacketsScreen } from './screens/PacketsScreen';
import { GenerateScreen } from './screens/GenerateScreen';
import { DataScreen } from './screens/DataScreen';
import './App.css';

const SCREENS: Record<SurfaceId, () => JSX.Element> = {
  dashboard: DashboardScreen,
  'catch-up': CatchUpScreen,
  ledger: LedgerScreen,
  packets: PacketsScreen,
  generate: GenerateScreen,
  data: DataScreen,
};

export function App() {
  const [active, setActive] = useState<SurfaceId>('packets');
  const surface = SURFACES.find((s) => s.id === active) ?? SURFACES[0];
  const Screen = SCREENS[active];

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">LIFE365</span>
        <span className="app-surface">{surface.label}</span>
      </header>

      <main className="app-main">
        <Screen />
      </main>

      <BottomNav active={active} onSelect={setActive} />
    </div>
  );
}
