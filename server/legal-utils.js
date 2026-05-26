import OpenAI from 'openai';
import mammoth from 'mammoth';
import * as pdfParse from 'pdf-parse';
import { diffWordsWithSpace, diffSentences } from 'diff';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const defaultKnowledgeNodes = [
  {
    id: 'C-010',
    node_type: 'CONSTRAINT',
    title: 'Liability cap policy',
    content: 'Firm policy: liability in any contract must be capped at maximum 2x the annual contract value. Uncapped liability = automatic HIGH risk flag.',
    tags: ['contract', 'liability']
  },
  {
    id: 'C-011',
    node_type: 'CONSTRAINT',
    title: 'Non-solicitation / non-compete duration',
    content: 'Firm policy: non-compete and non-solicitation clauses must not exceed 12 months. Any duration > 12 months must be rejected or negotiated down.',
    tags: ['contract', 'non_compete']
  },
  {
    id: 'C-012',
    node_type: 'CONSTRAINT',
    title: 'IP assignment carve-out',
    content: 'Firm policy: IP assignment clauses must include carve-out for pre-existing IP. Broad all-IP assignments without carve-out = HIGH risk.',
    tags: ['contract', 'ip']
  },
  {
    id: 'C-013',
    node_type: 'CONSTRAINT',
    title: 'Arbitration preferred',
    content: 'Firm policy: arbitration (SIAC or LCIA rules) preferred over litigation for cross-border contracts. Removal of arbitration clause = flag for review.',
    tags: ['contract', 'dispute']
  },
  {
    id: 'C-014',
    node_type: 'CONSTRAINT',
    title: 'Termination notice threshold',
    content: 'Firm policy: termination for convenience must have minimum 90 days notice. Shorter notice periods disadvantage our clients.',
    tags: ['contract', 'termination']
  }
];

function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function openAIEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function callOpenAIChat(messages) {
  const openai = getOpenAIClient();
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 260,
      temperature: 0.2
    });
    return response?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.warn('OpenAI unavailable:', error?.message ?? error);
    return null;
  }
}

async function getLlmAssessment(clauses) {
  if (!openAIEnabled()) return null;

  const clauseSummary = clauses
    .map((clause) => `Clause ${clause.index}: ${clause.clause_number || clause.title || 'Untitled'} | Score: ${clause.score} | Label: ${clause.label} | Issues: ${clause.issues.join(', ') || 'None'} | Summary: ${clause.summary}`)
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: 'You are a legal contract review assistant. Produce a concise overall risk summary and identify the most important issues from the extracted clauses.'
    },
    {
      role: 'user',
      content: `Here are extracted clauses and risk scores:\n\n${clauseSummary}\n\nProvide:\n1. A short overall risk summary.\n2. The top 3 risk themes or issues.\n3. One recommended next step.\nRespond in plain text.`
    }
  ];

  return await callOpenAIChat(messages);
}

async function getLlmComparison(comparisons, summary) {
  if (!openAIEnabled()) return null;

  const comparisonSummary = comparisons
    .slice(0, 12)
    .map((item, index) => {
      const title = item.a?.title || item.b?.title || `Change ${index + 1}`;
      return `${item.status}: ${title} (risk delta ${item.riskDelta >= 0 ? '+' : ''}${item.riskDelta})`;
    })
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: 'You are a legal contract comparison assistant. Summarize the key differences and risk impact between two versions of a contract.'
    },
    {
      role: 'user',
      content: `Comparison summary:\n- total changes: ${summary.totalChanges}\n- added: ${summary.added}\n- removed: ${summary.removed}\n- modified: ${summary.modified}\n- unchanged: ${summary.unchanged}\n- net risk: ${summary.netRisk}\n- risk label: ${summary.riskDeltaLabel}\n\nTop differences:\n${comparisonSummary}\n\nProvide a short plain-text summary of the most important risks and the likely impact of these changes.`
    }
  ];

  return await callOpenAIChat(messages);
}

export async function extractTextFromDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const cleanText = result.value
    .replace(/\r/g, '')
    .replace(/([0-9]+\.)/g, '\n$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

  const lines = cleanText.split('\n');
  if (lines.length && /test contract|nda|non-disclosure agreement|draft|version|v\d/i.test(lines[0].trim())) {
    lines.shift();
  }

  return lines.join('\n');
}

function isDocumentTitleClause(clause) {
  if (clause.clause_number) return false;
  if (!clause.title || !clause.text) return false;

  const normalized = clause.text.toLowerCase().trim();
  if (normalized.length > 120) return false;
  if (/\b(nda|non-disclosure agreement|test contract|agreement|contract|version|v\d|draft|confidential)\b/.test(normalized)) {
    return true;
  }
  return false;
}

export async function extractTextFromPdf(buffer) {
  const data = await pdfParse.default(buffer);
  return normalizeText(data.text);
}

export function splitIntoClauses(text) {
  const normalizedText = normalizeText(text);
  const lines = normalizedText.split('\n');
  const clauses = [];
  let current = { clause_number: null, title: null, text: '' };

  const headingPattern = /^\s*(?:((?:\d+(?:\.\d+)*(?:[A-Za-z])?)|[IVX]+)|((?:Article|Clause|Schedule|Annexure|Annex|Section)\s+[A-Za-z0-9]+))\s*[\.\)]?\s*-?\s*(.*)$/i;
  const uppercaseHeading = /^\s*([A-Z][A-Z\s\d\-/&]{3,})$/;

  function startClause(number, title, line) {
    if (current.text.trim()) {
      clauses.push({
        clause_number: current.clause_number,
        title: current.title,
        text: current.text.trim(),
        type: detectClauseType(current.title || current.text)
      });
    }
    current = {
      clause_number: number || null,
      title: title || line || null,
      text: line ? line.trim() : ''
    };
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(headingPattern);
    const uppercaseMatch = !headingMatch && line.match(uppercaseHeading);

    if (headingMatch && headingMatch[1]) {
      const clauseNumber = headingMatch[1].trim();
      const clauseTitle = headingMatch[3] ? headingMatch[3].trim() : null;
      startClause(clauseNumber, clauseTitle, clauseTitle ? clauseTitle : line);
    } else if (uppercaseMatch && line.length < 80) {
      startClause(null, uppercaseMatch[1].trim(), line);
    } else {
      current.text += (current.text ? '\n' : '') + line;
    }
  }
  if (current.text.trim()) {
    clauses.push({
      clause_number: current.clause_number,
      title: current.title,
      text: current.text.trim(),
      type: detectClauseType(current.title || current.text)
    });
  }
  if (clauses.length === 0 && normalizedText) {
    clauses.push({ clause_number: '1', title: 'Document', text: normalizedText, type: detectClauseType(normalizedText) });
  }
  return clauses;
}

function detectClauseType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('definition')) return 'definition';
  if (lower.includes('liabilit') || lower.includes('indemnif')) return 'liability';
  if (lower.includes('term') || lower.includes('termination') || lower.includes('renewal')) return 'term';
  if (lower.includes('confidential') || lower.includes('disclos')) return 'confidentiality';
  if (lower.includes('jurisdiction') || lower.includes('arbitration') || lower.includes('dispute')) return 'dispute';
  if (lower.includes('ip') || lower.includes('intellectual property') || lower.includes('assignment')) return 'ip';
  return 'general';
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function similarityScore(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens);
  const matchCount = bTokens.filter((token) => setA.has(token)).length;
  return matchCount / Math.max(aTokens.length, bTokens.length);
}

function titleMatchScore(a, b) {
  if (!a.title || !b.title) return 0;
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const titleA = normalize(a.title);
  const titleB = normalize(b.title);
  if (!titleA || !titleB) return 0;
  if (titleA === titleB) return 0.9;
  const tokensA = new Set(titleA.split(' '));
  const tokensB = titleB.split(' ');
  const shared = tokensB.filter((token) => tokensA.has(token)).length;
  return shared / Math.max(tokensA.size, tokensB.length) * 0.7;
}

function buildComparisonNote(a, b, status) {
  const lowerA = a.text.toLowerCase();
  const lowerB = b.text.toLowerCase();
  const arbitrationPattern = /arbitration|siac|lcia|dispute resolution|jurisdiction/;

  if (arbitrationPattern.test(lowerA) && !arbitrationPattern.test(lowerB)) {
    return 'Arbitration clause removed. Firm policy prefers arbitration. Risk increased.';
  }
  if (status === 'ADDED' && /non[- ]?compete|non[- ]?solicit/i.test(b.text) && /\d+\s*months/i.test(b.text)) {
    return 'New non-solicitation/non-compete clause may be HIGH risk if the duration exceeds 12 months.';
  }
  return null;
}

export function buildDiff(oldText, newText) {
  const parts = diffSentences(oldText, newText);
  const html = parts
    .map((part) => {
      const escaped = escapeHtml(part.value);
      if (part.added) return `<div class="diff-added">+ ${escaped}</div>`;
      if (part.removed) return `<div class="diff-removed">- ${escaped}</div>`;
      return `<div class="diff-context">${escaped}</div>`;
    })
    .join('');
  return html;
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function scoreClause(text) {
  const lower = text.toLowerCase();
  let score = 1;
  const issues = [];
  const constraints = [];

  if (/unlimited liability|uncapped liability|no cap/i.test(text)) {
    score = Math.max(score + 7, 8);
    issues.push('Uncapped liability is high risk.');
    constraints.push('C-010');
  }

  const nonSolicitMatch = text.match(/non[- ]?solicitat(?:ion|e)[^\d]*(\d+)\s*months/i);
  const nonCompeteMatch = text.match(/non[- ]?compete[^\d]*(\d+)\s*months/i);
  const durationMatch = nonSolicitMatch || nonCompeteMatch;
  if (durationMatch) {
    const months = Number(durationMatch[1]);
    if (months > 12) {
      score = Math.max(score + 4, 7);
      issues.push(`Duration is ${months} months, which exceeds the 12-month firm policy.`);
      constraints.push('C-011');
    }
  }

  if (/(all (intellectual property|ip) (created|assigned|belongs|shall belong|will belong|is owned))|all ip/i.test(lower)) {
    score += 2;
    issues.push('Broad IP ownership language may capture pre-existing IP.');
    constraints.push('C-012');
  }

  if (!/(arbitration|siac|lcia|dispute resolution|jurisdiction|court)/i.test(text)) {
    score += 1;
    issues.push('No clear arbitration or dispute resolution clause found.');
    constraints.push('C-013');
  }

  const terminationDays = text.match(/termination[^\d]{0,20}(\d+)\s*days/i);
  if (terminationDays && Number(terminationDays[1]) < 90) {
    score += 1;
    issues.push(`Termination notice of ${terminationDays[1]} days is below the 90-day policy.`);
    constraints.push('C-014');
  }

  const autoRenewMatch = text.match(/auto[- ]?renew|automatically renews|renew unless/i);
  if (autoRenewMatch) {
    const noticeMatch = text.match(/(\d+)\s*days/i);
    const noticeDays = noticeMatch ? Number(noticeMatch[1]) : null;
    if (!noticeDays || noticeDays < 90) {
      score += 1;
      issues.push('Auto-renewal with short or missing opt-out notice is risky.');
      constraints.push('AP-011');
    }
  }

  if (!/(return .* materials|destruction of confidential materials|destroy .* materials)/i.test(text) && /confidential/i.test(lower)) {
    score += 1;
    issues.push('No return or destruction clause for confidential materials found.');
    constraints.push('D-010');
  }

  const ldMatch = text.match(/(liquidated damages|ld)[:\s\S]{0,40}(\d+)x/i);
  if (ldMatch && Number(ldMatch[2]) >= 5) {
    score += 2;
    issues.push('Liquidated damages may be disproportionate to actual loss.');
    constraints.push('D-011');
  }

  if (/liability.*2x|cap.*2x|2x annual/i.test(text) && !/unlimited|uncapped/i.test(text)) {
    issues.push('Liability is capped at 2x, which aligns with firm policy.');
  }

  score = Math.min(Math.max(score, 1), 10);
  const label = score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';

  return {
    score,
    label,
    issues,
    constraints: Array.from(new Set(constraints)),
    summary: issues.join(' ')
  };
}

export async function assessDocument(text) {
  const clauses = splitIntoClauses(text);
  const scoredClauses = clauses.map((clause, index) => {
    const result = scoreClause(clause.text);
    return {
      ...clause,
      index: index + 1,
      normalized_text: normalizeText(clause.text),
      ...result
    };
  });

  const llmSummary = await getLlmAssessment(scoredClauses);
  return { clauses: scoredClauses, llmSummary };
}

export async function compareDocuments(textA, textB) {
  const clausesA = (await assessDocument(textA)).clauses.filter((clause) => !isDocumentTitleClause(clause));
  const clausesB = (await assessDocument(textB)).clauses.filter((clause) => !isDocumentTitleClause(clause));
  const matched = [];
  const usedB = new Set();

  const findByNumber = (number, list) => list.find((item) => item.clause_number && item.clause_number.toLowerCase() === number.toLowerCase());

  for (const clauseA of clausesA) {
    const match = clauseA.clause_number ? findByNumber(clauseA.clause_number, clausesB) : null;
    if (match) {
      usedB.add(match.index);
      matched.push(createComparison(clauseA, match));
    }
  }

  const unmatchedA = clausesA.filter((clauseA) => !matched.some((pair) => pair.a.index === clauseA.index));
  const unmatchedB = clausesB.filter((clauseB) => !usedB.has(clauseB.index));

  for (const clauseA of unmatchedA) {
    let best = null;
    let bestScore = 0;
    for (const clauseB of unmatchedB) {
      if (usedB.has(clauseB.index)) continue;
      const textScore = similarityScore(clauseA.text, clauseB.text);
      const titleScore = titleMatchScore(clauseA, clauseB);
      const typeScore = clauseA.type === clauseB.type && clauseA.type !== 'general' ? 0.15 : 0;
      const score = Math.max(textScore, titleScore, Math.min(1, textScore + typeScore));
      if (score > bestScore) {
        bestScore = score;
        best = clauseB;
      }
    }
    if (best && bestScore >= 0.2) {
      usedB.add(best.index);
      matched.push(createComparison(clauseA, best));
    }
  }

  const result = [...matched];
  const added = clausesB.filter((clauseB) => !usedB.has(clauseB.index));
  const removed = clausesA.filter((clauseA) => !result.some((pair) => pair.a.index === clauseA.index));

  for (const clause of removed) {
    const note = /arbitration|siac|lcia|dispute resolution|jurisdiction/.test(clause.text.toLowerCase())
      ? 'Arbitration clause removed. Firm policy prefers SIAC/LCIA arbitration.'
      : null;
    result.push({
      status: 'REMOVED',
      a: clause,
      b: null,
      diff: null,
      riskDelta: -clause.score,
      note
    });
  }
  for (const clause of added) {
    result.push({
      status: 'ADDED',
      a: null,
      b: clause,
      diff: null,
      riskDelta: clause.score,
      note: buildComparisonNote({ text: '', title: null, type: clause.type }, clause, 'ADDED')
    });
  }

  const netRisk = result.reduce((sum, item) => sum + (item.riskDelta || 0), 0);
  const summary = {
    totalChanges: result.filter((item) => item.status !== 'UNCHANGED').length,
    added: added.length,
    removed: removed.length,
    modified: result.filter((item) => item.status === 'MODIFIED').length,
    unchanged: result.filter((item) => item.status === 'UNCHANGED').length,
    netRisk,
    riskDeltaLabel: netRisk > 0 ? 'INCREASED' : netRisk < 0 ? 'DECREASED' : 'NEUTRAL'
  };

  const llmSummary = await getLlmComparison(result, summary);
  return { summary, clausesA, clausesB, comparisons: result, llmSummary };
}

function createComparison(a, b) {
  const normalizedA = normalizeText(a.text);
  const normalizedB = normalizeText(b.text);
  const status = normalizedA === normalizedB ? 'UNCHANGED' : 'MODIFIED';
  const note = buildComparisonNote(a, b, status);
  let riskDelta = b.score - a.score;
  if (note && note.includes('Arbitration clause removed')) {
    riskDelta += 1;
  }
  return {
    status,
    a,
    b,
    diff: status === 'MODIFIED' ? buildDiff(a.text, b.text) : null,
    riskDelta,
    note
  };
}

export function getKnowledgeNodesFromDb(rows) {
  if (!Array.isArray(rows) || !rows.length) return defaultKnowledgeNodes;
  return rows.map((row) => ({
    ...row,
    tags: typeof row.tags === 'string' ? row.tags.replace(/\[|\]|'/g, '').split(',').map((t) => t.trim()).filter(Boolean) : row.tags
  }));
}

export function getFallbackKnowledgeNodes() {
  return defaultKnowledgeNodes;
}
