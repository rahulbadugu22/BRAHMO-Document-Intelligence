import { useState } from 'react';
import type { ChangeEvent } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

type ClauseResult = {
  index: number;
  clause_number: string | null;
  title: string | null;
  text: string;
  type: string;
  score: number;
  label: 'LOW' | 'MEDIUM' | 'HIGH';
  issues: string[];
  constraints: string[];
  summary: string;
};

type AssessResult = {
  clauses: ClauseResult[];
  llmSummary?: string;
};

type ComparisonItem = {
  status: 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'REMOVED';
  a: ClauseResult | null;
  b: ClauseResult | null;
  diff: string | null;
  note?: string;
  riskDelta?: number;
};

type ComparisonResult = {
  summary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    netRisk: number;
    riskDeltaLabel: string;
  };
  comparisons: ComparisonItem[];
  llmSummary?: string;
};

function App() {
  const [documentText, setDocumentText] = useState('');
  const [documentA, setDocumentA] = useState('');
  const [documentB, setDocumentB] = useState('');
  const [riskResult, setRiskResult] = useState<AssessResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchJson(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error((payload as any).error || response.statusText);
    }
    return response.json();
  }

  async function handleAssess() {
    setLoading(true);
    setError('');
    try {
      const result = (await fetchJson(`${apiBase}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: documentText })
      })) as AssessResult;
      setRiskResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    setLoading(true);
    setError('');
    try {
      const result = (await fetchJson(`${apiBase}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textA: documentA, textB: documentB })
      })) as ComparisonResult;
      setComparisonResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>, setter: (value: string) => void) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);
    setError('');
    try {
      const result = await fetchJson(`${apiBase}/extract`, { method: 'POST', body: formData });
      setter((result as any).text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header>
        <h1>BRAHMO Document Intelligence</h1>
        <p>Legal clause extraction, comparison, and risk scoring from DOCX/PDF or pasted text.</p>
      </header>

      <section className="card">
        <h2>Single Document Risk Assessment</h2>
        <p>Paste contract text or upload a DOCX/PDF.</p>
        <textarea
          rows={10}
          value={documentText}
          onChange={(e) => setDocumentText(e.target.value)}
          placeholder="Paste contract text here..."
        />
        <div className="row">
          <label>
            Upload file:
            <input type="file" accept=".docx,.pdf" onChange={(event) => handleFileUpload(event, setDocumentText)} />
          </label>
          <button onClick={handleAssess} disabled={loading || !documentText}>Assess Risk</button>
        </div>
        {riskResult && (
          <>
            <div className="result-card">
              <h3>Risk Heatmap</h3>
              <p>{riskResult.clauses.length} clauses extracted.</p>
              <div className="clause-list">
                {riskResult.clauses.map((clause) => (
                  <div key={clause.index} className={`clause-item status-${clause.label.toLowerCase()}`}>
                    <strong>{clause.clause_number || clause.title || `Clause ${clause.index}`}</strong>
                    <span>{clause.label} ({clause.score}/10)</span>
                    <p>{clause.title}</p>
                    <p>{clause.summary}</p>
                  </div>
                ))}
              </div>
            </div>
            {riskResult.llmSummary && (
              <div className="result-card">
                <h3>AI Review Summary</h3>
                <p>{riskResult.llmSummary}</p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Two-Document Comparison</h2>
        <div className="row">
          <div className="half-panel">
            <h3>Document A</h3>
            <textarea
              rows={8}
              value={documentA}
              onChange={(e) => setDocumentA(e.target.value)}
              placeholder="Paste document A text here..."
            />
            <label>
              Upload A:
              <input type="file" accept=".docx,.pdf" onChange={(event) => handleFileUpload(event, setDocumentA)} />
            </label>
          </div>
          <div className="half-panel">
            <h3>Document B</h3>
            <textarea
              rows={8}
              value={documentB}
              onChange={(e) => setDocumentB(e.target.value)}
              placeholder="Paste document B text here..."
            />
            <label>
              Upload B:
              <input type="file" accept=".docx,.pdf" onChange={(event) => handleFileUpload(event, setDocumentB)} />
            </label>
          </div>
        </div>
        <button onClick={handleCompare} disabled={loading || !documentA || !documentB}>Compare Documents</button>

        {comparisonResult && (
          <>
            <div className="result-card">
              <h3>Comparison Summary</h3>
              <p>{comparisonResult.summary.totalChanges} changes detected. Risk: {comparisonResult.summary.riskDeltaLabel}</p>
              <div className="comparison-list">
                {comparisonResult.comparisons.map((item, index) => (
                  <div key={index} className={`clause-item status-${item.status.toLowerCase()}`}>
                    <strong>{item.a?.clause_number || item.b?.clause_number || `Change ${index + 1}`}</strong>
                    <span>{item.status}</span>
                    <p>{item.a?.title || item.b?.title}</p>
                    {(item.status === 'ADDED' || item.status === 'REMOVED') && (
                      <p className="clause-risk-label">
                        Risk: {item.b?.label || item.a?.label} ({item.b?.score ?? item.a?.score}/10)
                      </p>
                    )}
                    {item.diff ? (
                      <div className="diff" dangerouslySetInnerHTML={{ __html: item.diff }} />
                    ) : (
                      <p>{item.a?.text || item.b?.text}</p>
                    )}
                    {item.note && <p className="change-note">{item.note}</p>}
                    {(item.status === 'ADDED' || item.status === 'REMOVED' || item.status === 'MODIFIED') && (
                      <p className="clause-summary">{item.b?.summary || item.a?.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {comparisonResult.llmSummary && (
              <div className="result-card">
                <h3>AI Comparison Summary</h3>
                <p>{comparisonResult.llmSummary}</p>
              </div>
            )}
          </>
        )}
      </section>

      {error && <div className="error-box">{error}</div>}
    </div>
  );
}

export default App;
