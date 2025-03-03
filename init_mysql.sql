-- Initialize MySQL Database for Voice Call AI

CREATE DATABASE IF NOT EXISTS voice_call_ai;
USE voice_call_ai;

-- Calls table for storing call history
CREATE TABLE IF NOT EXISTS calls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_sid VARCHAR(255) NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    status VARCHAR(50) NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration INT,
    recording_url TEXT,
    transcription TEXT,
    cost DECIMAL(10, 4),
    segments INT,
    ultravox_cost DECIMAL(10, 4),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Knowledge Base Documents table
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    vector_embedding JSON,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Service Connections table
CREATE TABLE IF NOT EXISTS service_connections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(50) NOT NULL,
    credentials JSON,
    is_connected BOOLEAN DEFAULT FALSE,
    last_connected DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_service (service_name)
);

-- Insert default service records
INSERT IGNORE INTO service_connections (service_name, is_connected) VALUES
('twilio', FALSE),
('google_drive', FALSE),
('ultravox', FALSE),
('supabase', FALSE);
