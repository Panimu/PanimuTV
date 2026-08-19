// TV Time export importer: pick a file, review what was found, then run the
// import with live progress. Merges into the library — nothing is removed.

import { useRef, useState } from 'react'
import { IconUpload, IconX } from './Icons'
import { runImport, type ImportProgress, type ImportResult } from '../lib/importer'
import { buildImportPlan, type ImportPlan } from '../lib/tvtime'
import { readZip, ZipError } from '../lib/zip'
import { toast } from '../lib/toast'

type Stage = 'idle' | 'reading' | 'preview' | 'running' | 'done'

export function TvTimeImport() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStage('idle')
    setPlan(null)
    setProgress(null)
    setResult(null)
    setError(null)
  }

  async function onFiles(fileList: FileList) {
    const files = [...fileList]
    if (!files.length) return
    setStage('reading')
    setError(null)
    setResult(null)
    try {
      const contents: { name: string; text: string }[] = []
      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          for (const entry of await readZip(file)) {
            if (!/\.(csv|tsv|txt)$/i.test(entry.name)) continue
            contents.push({ name: entry.name, text: await entry.text() })
          }
        } else {
          contents.push({ name: file.name, text: await file.text() })
        }
      }
      if (!contents.length) {
        throw new Error('No CSV files found — pick the TV Time export ZIP or its CSV files.')
      }
      const built = buildImportPlan(contents)
      setPlan(built)
      setStage('preview')
    } catch (err) {
      setError(
        err instanceof ZipError || err instanceof Error ? err.message : 'Could not read that file.',
      )
      setStage('idle')
    }
  }

  async function start() {
    if (!plan) return
    setStage('running')
    setProgress({ done: 0, total: plan.shows.length, current: '' })
    try {
      const res = await runImport(plan, setProgress)
      setResult(res)
      setStage('done')
      toast(
        `Imported ${res.showsAdded} show${res.showsAdded === 1 ? '' : 's'} · ${res.episodesMarked} episode${res.episodesMarked === 1 ? '' : 's'}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('preview')
    }
  }

  return (
    <div className="import-panel">
      <div className="import-head">
        <div>
          <h3 className="import-title">Import from TV Time</h3>
          <p className="hint import-hint">
            Request your data from TV Time (Settings → Account → Download my data), then drop the
            ZIP here. Your existing history is kept — this only adds.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => inputRef.current?.click()}
          disabled={stage === 'reading' || stage === 'running'}
        >
          <IconUpload size={16} /> Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.csv,.tsv,application/zip,text/csv"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && <div className="notice">{error}</div>}
      {stage === 'reading' && <div className="hint">Reading export…</div>}

      {stage === 'preview' && plan && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>{plan.shows.length}</strong> shows ·{' '}
            <strong>{plan.totalEpisodes.toLocaleString()}</strong> watched episodes found
          </div>
          {plan.warnings.map((w) => (
            <div key={w} className="notice notice-info">
              {w}
            </div>
          ))}
          <details className="import-files">
            <summary>Files read ({plan.files.length})</summary>
            <ul>
              {plan.files.map((f) => (
                <li key={f.name}>
                  <code>{f.name}</code> — {f.kind}
                  {f.rows > 0 ? ` (${f.rows.toLocaleString()} rows)` : ''}
                </li>
              ))}
            </ul>
          </details>
          {plan.shows.length > 0 && (
            <details className="import-files">
              <summary>Shows found</summary>
              <ul>
                {plan.shows.map((s, i) => (
                  <li key={`${s.sourceId ?? s.name}-${i}`}>
                    {s.name ?? `TVDB #${s.sourceId}`}
                    {s.episodes.length > 0
                      ? ` — ${s.episodes.length} episode${s.episodes.length === 1 ? '' : 's'}`
                      : ' — follow only'}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="btn-row">
            <button
              className="btn btn-accent"
              onClick={() => void start()}
              disabled={!plan.shows.length}
            >
              Import {plan.shows.length} shows
            </button>
            <button className="btn" onClick={reset}>
              <IconX size={15} /> Cancel
            </button>
          </div>
          <p className="hint">
            This looks each show up on TheTVDB, so a large library takes a few minutes.
          </p>
        </div>
      )}

      {stage === 'running' && progress && (
        <div className="import-progress">
          <div className="progress">
            <div
              className="progress-fill"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <div className="hint">
            Importing {progress.done} / {progress.total}
            {progress.current ? ` — ${progress.current}` : ''}
          </div>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="import-result">
          <div className="import-summary">
            Added <strong>{result.showsAdded}</strong> shows, updated{' '}
            <strong>{result.showsUpdated}</strong>, marked{' '}
            <strong>{result.episodesMarked.toLocaleString()}</strong> episodes watched.
          </div>
          {result.matchedByName.length > 0 && (
            <details className="import-files">
              <summary>Matched by title ({result.matchedByName.length}) — worth a check</summary>
              <ul>
                {result.matchedByName.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {result.unmatched.length > 0 && (
            <details className="import-files" open>
              <summary>Not found on TheTVDB ({result.unmatched.length})</summary>
              <ul>
                {result.unmatched.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {result.showsAdded === 0 && result.episodesMarked === 0 && (
            <div className="notice">
              Nothing was imported. If every show failed, check your connection and API key on
              this page, then try the import again — re-importing is safe.
            </div>
          )}
          {result.errors.length > 0 && (
            <details className="import-files" open>
              <summary>Errors ({result.errors.length})</summary>
              <ul>
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="btn-row">
            <button className="btn" onClick={reset}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
