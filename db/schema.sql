CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id VARCHAR(32) PRIMARY KEY,
  node_type VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSON DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  text LONGTEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_clauses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  clause_number VARCHAR(64),
  clause_title TEXT,
  clause_type VARCHAR(64),
  clause_text LONGTEXT NOT NULL,
  clause_index INT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
