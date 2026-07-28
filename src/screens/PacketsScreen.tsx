import { useEffect, useRef, useState } from 'react';
import {
  validatePlanPacketJson,
  type PlanPacketValidationResult,
} from '../domain/validatePlanPacket';
import type {
  ChangeSummary,
  InstallError,
  InstallPlan,
  TypeChangeSummary,
} from '../domain/installTypes';
import type { PlanPacket } from '../domain/planPacket';
import { getDb, type StoredPacket } from '../db/database';
import { commitInstall, prepareInstall } from '../db/installFlow';
import { readPacketHistory } from '../db/queries';
import { SEED_PACKET_JSON } from '../dev/seedPacket';

/**
 * Packets screen (Packet 0001B scope).
 *
 * Validation stays pure and mutation-free. After a packet validates, the user
 * can run installation preflight, review the proposed changes (or installation
 * errors, which are shown distinctly from schema-validation errors), and — for
 * a non-no-op — explicitly confirm before anything is written. Installed packet
 * history is listed below. All rules live in the domain and db layers; this
 * component only orchestrates and renders.
 */

type InstallState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'errors'; errors: InstallError[] }
  | { phase: 'noop' }
  | { phase: 'preview'; plan: InstallPlan }
  | { phase: 'installing'; plan: InstallPlan }
  | { phase: 'done'; summary: ChangeSummary };

export function PacketsScreen() {
  const [jsonText, setJsonText] = useState('');
  const [result, setResult] = useState<PlanPacketValidationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [install, setInstall] = useState<InstallState>({ phase: 'idle' });
  const [history, setHistory] = useState<StoredPacket[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function refreshHistory() {
    const packets = await readPacketHistory(getDb());
    setHistory(packets);
  }

  function resetInstall() {
    setInstall({ phase: 'idle' });
  }

  function validate(text: string) {
    // Pure validation only — no persistent state is touched here.
    setResult(validatePlanPacketJson(text));
    setRawText(text);
    resetInstall();
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setJsonText(text);
    setResult(null);
    resetInstall();
  }

  function loadSeed() {
    // Dev fixture flows through the identical validation and install path.
    setFileName('seed-plan-packet.v0.1.json (dev fixture)');
    setJsonText(SEED_PACKET_JSON);
    setResult(null);
    resetInstall();
  }

  function clearAll() {
    setJsonText('');
    setResult(null);
    setFileName(null);
    setRawText('');
    resetInstall();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function runPreflight(packet: PlanPacket) {
    setInstall({ phase: 'checking' });
    const preflight = await prepareInstall(getDb(), packet, rawText);
    if (!preflight.ok) {
      setInstall({ phase: 'errors', errors: preflight.errors });
      return;
    }
    if (preflight.plan.noop) {
      setInstall({ phase: 'noop' });
      return;
    }
    setInstall({ phase: 'preview', plan: preflight.plan });
  }

  async function confirmInstall(plan: InstallPlan) {
    setInstall({ phase: 'installing', plan });
    await commitInstall(getDb(), plan);
    setInstall({ phase: 'done', summary: plan.summary });
    await refreshHistory();
  }

  const validPacket = result && result.ok ? result.packet : null;

  return (
    <section className="screen">
      <h1 className="screen-title">Packets</h1>
      <p className="screen-body">
        Paste or select a Plan Packet, validate it, then install it. Validation
        and preflight never change stored state; installation applies only after
        you confirm.
      </p>

      <div className="packet-actions">
        <button
          type="button"
          className="btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Select JSON file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={onFileSelected}
        />
        {import.meta.env.DEV && (
          <button type="button" className="btn btn--ghost" onClick={loadSeed}>
            Load seed packet (dev)
          </button>
        )}
      </div>

      {fileName && <p className="packet-filename">Source: {fileName}</p>}

      <label className="field-label" htmlFor="packet-json">
        Packet JSON
      </label>
      <textarea
        id="packet-json"
        className="packet-textarea"
        value={jsonText}
        spellCheck={false}
        placeholder="Paste Plan Packet JSON here…"
        onChange={(e) => {
          setJsonText(e.target.value);
          setResult(null);
          resetInstall();
        }}
      />

      <div className="packet-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={jsonText.trim().length === 0}
          onClick={() => validate(jsonText)}
        >
          Validate
        </button>
        <button type="button" className="btn btn--ghost" onClick={clearAll}>
          Clear
        </button>
      </div>

      {result && <ValidationOutput result={result} />}

      {validPacket && (
        <div className="install-block">
          <div className="packet-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={
                install.phase === 'checking' || install.phase === 'installing'
              }
              onClick={() => runPreflight(validPacket)}
            >
              {install.phase === 'checking'
                ? 'Checking…'
                : 'Install packet'}
            </button>
          </div>
          <InstallOutput
            state={install}
            onConfirm={confirmInstall}
          />
        </div>
      )}

      <PacketHistory history={history} />
    </section>
  );
}

function ValidationOutput({ result }: { result: PlanPacketValidationResult }) {
  if (result.ok) {
    const { packet, counts } = result;
    return (
      <div className="validation validation--ok" role="status">
        <h2 className="validation-title">Valid packet</h2>
        <dl className="packet-meta">
          <div>
            <dt>Title</dt>
            <dd>{packet.title}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{packet.scope_id}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{packet.revision}</dd>
          </div>
          <div>
            <dt>Packet id</dt>
            <dd>{packet.packet_id}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{packet.created_at}</dd>
          </div>
        </dl>
        {packet.summary && <p className="packet-summary">{packet.summary}</p>}
        <ul className="packet-counts">
          <li>
            Items: {counts.itemsUpsert} upsert / {counts.itemsRetire} retire
          </li>
          <li>
            Prompts: {counts.promptsUpsert} upsert / {counts.promptsRetire}{' '}
            retire
          </li>
          <li>
            Recipes: {counts.recipesUpsert} upsert / {counts.recipesRetire}{' '}
            retire
          </li>
        </ul>
        <p className="screen-note">
          Preview only. No state has changed. Use “Install packet” below to run
          preflight.
        </p>
      </div>
    );
  }

  const stageLabel =
    result.stage === 'json' ? 'Invalid JSON' : 'Schema validation failed';
  return (
    <div className="validation validation--error" role="alert">
      <h2 className="validation-title">{stageLabel}</h2>
      <ul className="validation-issues">
        {result.issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <code>{issue.path}</code>: {issue.message}
          </li>
        ))}
      </ul>
      <p className="screen-note">No state was changed.</p>
    </div>
  );
}

function InstallOutput({
  state,
  onConfirm,
}: {
  state: InstallState;
  onConfirm: (plan: InstallPlan) => void;
}) {
  if (state.phase === 'errors') {
    return (
      <div className="validation validation--error" role="alert">
        <h2 className="validation-title">Cannot install this packet</h2>
        <ul className="validation-issues">
          {state.errors.map((error, index) => (
            <li key={`${error.code}-${error.id ?? index}`}>
              <code>{error.objectType}</code>: {error.message}
            </li>
          ))}
        </ul>
        <p className="screen-note">
          These are installation errors, separate from schema validation. No
          state was changed.
        </p>
      </div>
    );
  }

  if (state.phase === 'noop') {
    return (
      <div className="validation validation--ok" role="status">
        <h2 className="validation-title">Already installed</h2>
        <p className="screen-body">
          This exact packet is already installed. No changes were made and no
          duplicate history was created.
        </p>
      </div>
    );
  }

  if (state.phase === 'preview' || state.phase === 'installing') {
    const { plan } = state;
    return (
      <div className="validation validation--ok" role="status">
        <h2 className="validation-title">Proposed installation</h2>
        <ChangeSummaryView summary={plan.summary} />
        <div className="packet-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={state.phase === 'installing'}
            onClick={() => onConfirm(plan)}
          >
            {state.phase === 'installing' ? 'Installing…' : 'Confirm install'}
          </button>
        </div>
        <p className="screen-note">
          Nothing has been written yet. Confirm to apply these changes.
        </p>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className="validation validation--ok" role="status">
        <h2 className="validation-title">Packet installed</h2>
        <ChangeSummaryView summary={state.summary} />
      </div>
    );
  }

  return null;
}

function ChangeSummaryView({ summary }: { summary: ChangeSummary }) {
  return (
    <div className="change-summary">
      <TypeChangeRow label="Items" summary={summary.items} />
      <TypeChangeRow label="Prompts" summary={summary.prompts} />
      <TypeChangeRow label="Recipes" summary={summary.recipes} />
      {summary.supersededPacketIds.length > 0 && (
        <p className="change-line">
          Supersedes: {summary.supersededPacketIds.join(', ')}
        </p>
      )}
    </div>
  );
}

function TypeChangeRow({
  label,
  summary,
}: {
  label: string;
  summary: TypeChangeSummary;
}) {
  const { additions, updates, retirements, unchanged } = summary;
  return (
    <p className="change-line">
      <strong>{label}:</strong> {additions.length} added, {updates.length}{' '}
      updated, {retirements.length} retired, {unchanged.length} unchanged
    </p>
  );
}

function PacketHistory({ history }: { history: StoredPacket[] | null }) {
  if (history === null) {
    return null;
  }
  const sorted = history
    .slice()
    .sort((a, b) => {
      if (a.scopeId !== b.scopeId) return a.scopeId < b.scopeId ? -1 : 1;
      return a.revision - b.revision;
    });

  return (
    <div className="install-block">
      <h2 className="dash-section-title">Installed packet history</h2>
      {sorted.length === 0 ? (
        <p className="screen-note">No packets installed yet.</p>
      ) : (
        <ul className="history-list">
          {sorted.map((packet) => (
            <li key={packet.packetId} className="history-item">
              <div className="history-head">
                <span className="history-title">{packet.title}</span>
                <span
                  className={`history-status history-status--${packet.status}`}
                >
                  {packet.status}
                </span>
              </div>
              <dl className="history-meta">
                <div>
                  <dt>Scope</dt>
                  <dd>{packet.scopeId}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{packet.revision}</dd>
                </div>
                <div>
                  <dt>Packet id</dt>
                  <dd>{packet.packetId}</dd>
                </div>
                <div>
                  <dt>Installed</dt>
                  <dd>{packet.installedAt}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
