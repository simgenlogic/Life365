import { useEffect, useState } from 'react';
import { getDb, type StoredItem } from '../db/database';
import { readAllItems } from '../db/queries';
import { selectCarryForward } from '../domain/carryForward';

/**
 * Dashboard screen (Packet 0001B scope).
 *
 * Renders the persistent Carry Forward section from installed items. Selection
 * and ordering are delegated to the pure `selectCarryForward` domain function;
 * this component only fetches rows and renders. Record capture is not yet
 * implemented, so every card shows the neutral record-age state "No records
 * yet". Available Now and Catch Up remain deferred to later milestones.
 */
export function DashboardScreen() {
  const [items, setItems] = useState<StoredItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void readAllItems(getDb()).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  const cards = items ? selectCarryForward(items) : [];

  return (
    <section className="screen">
      <h1 className="screen-title">Dashboard</h1>

      <div className="dash-section">
        <h2 className="dash-section-title">Carry Forward</h2>
        {items === null ? (
          <p className="screen-note">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="screen-body">
            No carry-forward items yet. Install a packet on the Packets screen to
            populate this section.
          </p>
        ) : (
          <ul className="carry-list">
            {cards.map((item) => (
              <CarryForwardCard key={`${item.scopeId}:${item.itemId}`} item={item} />
            ))}
          </ul>
        )}
      </div>

      <p className="screen-note">
        Available Now and Catch Up render once opportunity generation and
        recording land in a later Packet 0001 milestone.
      </p>
    </section>
  );
}

function CarryForwardCard({ item }: { item: StoredItem }) {
  const { label, summary, tags } = item.definition;
  return (
    <li className="carry-card">
      <div className="carry-card-head">
        <span className="carry-card-label">{label}</span>
        <span className="carry-card-age">No records yet</span>
      </div>
      {summary && <p className="carry-card-summary">{summary}</p>}
      {tags.length > 0 && (
        <ul className="carry-tags" aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag} className="carry-tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
