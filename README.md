# BRAHMO Document Intelligence

AI-powered legal document intelligence system for clause extraction, contract comparison, and risk scoring.

## Features

- Upload and process DOCX/PDF contracts
- Legal clause extraction and chunking
- Clause-by-clause contract comparison
- Word-level diff visualization
- Risk heatmap generation
- Firm policy-based legal risk scoring
- Detection of ADDED / REMOVED / MODIFIED clauses
- Optional OpenAI summary generation for review notes

## Architecture

Document Upload → Text Extraction (DOCX/PDF) → Clause Chunking → Clause Comparison → Risk Scoring → Risk Heatmap & Diff UI

## Example Risk Rules

- Unlimited liability → HIGH risk
- Non-compete duration > 12 months → HIGH risk
- Missing arbitration clause → MEDIUM risk
- Missing confidentiality return clause → MEDIUM risk

## Tech Stack

Frontend:
- React
- Vite

Backend:
- Express.js

Libraries:
- mammoth
- pdf-parse
- diff
- openai (optional)
- mysql2

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` if you want LLM summaries.

3. Start the app:
   ```bash
   npm run dev
   ```

4. Open the frontend at `http://localhost:5173`.

## Notes

- The app supports DOCX and PDF extraction, legal clause chunking, comparison, and risk scoring.
- MySQL is used for knowledge nodes when available, with fallback behavior if it is not configured.
