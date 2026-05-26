# Architecture

## Overview

This project is a document intelligence system for legal contract analysis. It includes:

- `src/` — React frontend for contract upload, risk assessment, and comparison
- `server/` — Express backend for text extraction, legal clause chunking, document comparison, and risk scoring
- `db/` — MySQL schema and seed SQL for firm knowledge nodes and document storage

## Data Flow

1. Frontend collects contract text or file uploads.
2. The backend extracts raw text from DOCX or PDF files.
3. Text is split into clauses using legal-aware heading detection.
4. Each clause is scored for risk using rule-based scoring and firm knowledge nodes.
5. Two documents can be compared clause-by-clause, with unchanged, modified, added, and removed statuses.
6. Modified clauses show word-level diff output.

## Key Components

### Clause Chunker

The clause chunker identifies clause boundaries using:

- numbered headings like `1.`, `2.1`, `8A`
- legal heading keywords like `Article`, `Clause`, `Schedule`, `Annexure`
- uppercase section headers

It preserves sub-clause text and avoids splitting inside a clause.

### Comparator

The comparator matches clauses by clause number first, then by text similarity for restructured clauses. It classifies changes as:

- `UNCHANGED`
- `MODIFIED`
- `ADDED`
- `REMOVED`

For modified clauses, it generates a word-level diff with additions and removals highlighted.

### Risk Scoring

Risk scoring is rule-based and driven by firm knowledge nodes. It detects:

- uncapped liability
- non-solicitation duration > 12 months
- broad IP assignment language
- missing arbitration/dispute resolution
- termination notice below 90 days
- auto-renewal with short opt-out
- missing return of materials clause
- disproportionate liquidated damages

Scores are converted into LOW/MEDIUM/HIGH categories and include constraint flags.

## Environment

- Frontend uses `VITE_API_BASE_URL` for the backend API endpoint.
- Backend reads `PORT`, `MYSQL_*`, and `OPENAI_API_KEY` from `.env`.
- Fallback knowledge nodes are used when MySQL is unavailable.

## Run

- `npm install`
- `npm run dev`
- Frontend opens at `http://localhost:5173`
- Backend runs on `http://localhost:4000`

## Notes

The current implementation supports proof-of-concept clause extraction and comparison. It can be extended with:

- document storage in MySQL
- embeddings-based semantic matching
- richer risk scoring via an LLM API
- audit logging and user authentication
