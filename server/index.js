import fs from 'fs/promises';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import multer from 'multer';
import dotenv from 'dotenv';
import {
  extractTextFromDocx,
  extractTextFromPdf,
  splitIntoClauses,
  assessDocument,
  compareDocuments,
  getKnowledgeNodesFromDb,
  getFallbackKnowledgeNodes
} from './legal-utils.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'brahmo_doc_intelligence'
};

async function initializeDatabase() {
  const baseConfig = {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    multipleStatements: true
  };
  const tempConnection = await mysql.createConnection(baseConfig);
  await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await tempConnection.end();

  const connection = await mysql.createConnection({ ...baseConfig, database: dbConfig.database });
  const schemaPath = new URL('../db/schema.sql', import.meta.url);
  const schemaText = await fs.readFile(schemaPath, 'utf8');
  await connection.query(schemaText);

  try {
    const [rows] = await connection.query('SELECT COUNT(*) AS count FROM knowledge_nodes');
    const count = rows?.[0]?.count ?? 0;
    if (count === 0) {
      const seedPath = new URL('../db/seed.sql', import.meta.url);
      const seedText = await fs.readFile(seedPath, 'utf8');
      await connection.query(seedText);
    }
  } catch (err) {
    console.warn('Could not verify or seed knowledge_nodes:', err?.message || err);
  }

  await connection.end();
}

async function tryGetKnowledgeNodes() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query('SELECT id, node_type, title, content, tags FROM knowledge_nodes LIMIT 20');
    await connection.end();
    return getKnowledgeNodesFromDb(rows);
  } catch (error) {
    console.warn('Unable to connect to MySQL, using fallback knowledge nodes:', error.message);
    return getFallbackKnowledgeNodes();
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'BRAHMO backend' });
});

app.get('/api/knowledge-nodes', async (req, res) => {
  const nodes = await tryGetKnowledgeNodes();
  res.json(nodes);
});

app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    if (req.file) {
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || '';
      let text = '';
      if (ext === 'docx') {
        text = await extractTextFromDocx(req.file.buffer);
      } else if (ext === 'pdf') {
        text = await extractTextFromPdf(req.file.buffer);
      } else {
        return res.status(400).json({ error: 'Unsupported file type' });
      }
      return res.json({ text });
    }

    if (req.body.text) {
      return res.json({ text: req.body.text });
    }

    res.status(400).json({ error: 'No file or text provided' });
  } catch (error) {
    console.error('Extract error', error);
    res.status(500).json({ error: 'Failed to extract document text', detail: error.message });
  }
});

app.post('/api/assess', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text to assess' });
  try {
    const assessment = await assessDocument(text);
    res.json(assessment);
  } catch (error) {
    console.error('Assess error', error);
    res.status(500).json({ error: 'Failed to assess document', detail: error?.message || String(error) });
  }
});

app.post('/api/compare', async (req, res) => {
  const { textA, textB } = req.body;
  if (!textA || !textB) return res.status(400).json({ error: 'Missing both document texts' });
  try {
    const comparison = await compareDocuments(textA, textB);
    res.json(comparison);
  } catch (error) {
    console.error('Compare error', error);
    res.status(500).json({ error: 'Failed to compare documents', detail: error?.message || String(error) });
  }
});

async function startServer() {
  try {
    await initializeDatabase();
    console.log('MySQL database initialized successfully.');
  } catch (error) {
    console.warn('MySQL initialization failed, continuing with fallback behavior:', error?.message || error);
  }

  app.listen(port, () => {
    console.log(`Express backend listening on http://localhost:${port}`);
  });
}

startServer();
