-- Create table for storing service credentials
CREATE TABLE IF NOT EXISTS service_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service VARCHAR(255) NOT NULL,
    credentials JSON NOT NULL,
    is_connected BOOLEAN DEFAULT FALSE,
    last_connected TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_service (user_id, service)
);

-- Create table for knowledge base documents
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    document_id VARCHAR(255) NULL,
    filename VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,
    supabase_table VARCHAR(255) NOT NULL,
    size BIGINT NULL,
    chunk_count INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_document_id (document_id)
);

-- Add service connection history table
CREATE TABLE IF NOT EXISTS service_connection_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_service (user_id, service)
);

-- Add service activity tracking table
CREATE TABLE IF NOT EXISTS service_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    parameters JSON NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_service (user_id, service)
);
