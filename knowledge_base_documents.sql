CREATE TABLE knowledge_base_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    source VARCHAR(255) NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    size INT,
    last_modified DATETIME,
    vector TEXT
);
