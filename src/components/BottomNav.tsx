import { SURFACES, type SurfaceId } from '../navigation';

interface BottomNavProps {
  active: SurfaceId;
  onSelect: (id: SurfaceId) => void;
}

/** Fixed six-destination bottom navigation. */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {SURFACES.map((surface) => {
        const isActive = surface.id === active;
        return (
          <button
            key={surface.id}
            type="button"
            className={`nav-item${isActive ? ' nav-item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(surface.id)}
          >
            <span className="nav-icon" aria-hidden="true">
              {surface.icon}
            </span>
            <span className="nav-label">{surface.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
