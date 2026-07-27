import { useRef, useState } from 'react';
import {
  validatePlanPacketJson,
  type PlanPacketValidationResult,
} from '../domain/validatePlanPacket';
import { SEED_PACKET_JSON } from '../dev/seedPacket';

/**
 * Packets screen (Packet 0001A scope).
 *
 * Supports pasting JSON, selecting a JSON file, and validating *without*
 * changing any state. On success it previews packet metadata and change counts;
 * on failure it shows the stage and each issue. Installation, history, and
 * supersession are deferred to a later milestone.
 */
export function PacketsScreen() {
  const [jsonText, setJsonText] = useState('');
  const [result, setResult] = useState<PlanPacketValidationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function validate(text: string) {
    // Pure validation only — no persistent state is touched here.
    setResult(validatePlanPacketJson(text));
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setJsonText(text);
    setResult(null);
  }

  function loadSeed() {
    // Dev fixture flows through the identical validation path.
    setFileName('seed-plan-packet.v0.1.json (dev fixture)');
    setJsonText(SEED_PACKET_JSON);
    setResult(null);
  }

  function clearAll() {
    setJsonText('');
    setResult(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="screen">
      <h1 className="screen-title">Packets</h1>
      <p className="screen-body">
        Paste or select a Plan Packet and validate it. Validation never changes
        stored state.
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
          Preview only. Installation is not implemented in this milestone, so no
          state has changed.
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
