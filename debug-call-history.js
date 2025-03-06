// debug-call-history.js - Script to debug call history database issues

const mysql = require('mysql2/promise');
const fs = require('fs');

// Configuration from backend settings
const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'voice_call_ai'
};

async function debugCallHistory() {
  console.log('Call History Debug Tool');
  console.log('------------------------');
  console.log(`Testing database connection to ${config.host}/${config.database}`);
  
  let connection;
  
  try {
    // Connect to the database
    connection = await mysql.createConnection(config);
    console.log('✅ Database connection successful');
    
    // Check if the calls table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'calls'
    `, [config.database]);
    
    if (tables.length === 0) {
      console.log('❌ Calls table does not exist in the database');
      console.log('Creating calls table...');
      
      await connection.execute(`
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
        )
      `);
      console.log('✅ Calls table created successfully');
    } else {
      console.log('✅ Calls table exists in the database');
    }
    
    // Check if there are any call records
    const [calls] = await connection.execute('SELECT COUNT(*) as count FROM calls');
    console.log(`Found ${calls[0].count} call records in the database`);
    
    // If we have a specific call number to check
    const phoneNumber = '+212615962601';
    const [specificCalls] = await connection.execute('SELECT * FROM calls WHERE to_number = ?', [phoneNumber]);
    
    if (specificCalls.length === 0) {
      console.log(`❌ No calls found for ${phoneNumber}`);
      
      // Insert a manual test record for the missing call
      console.log(`Creating a test record for ${phoneNumber}...`);
      const now = new Date();
      const callSid = `TEST-${Date.now()}`;
      
      await connection.execute(`
        INSERT INTO calls (call_sid, from_number, to_number, direction, status, start_time, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        callSid,
        '+1234567890', // from_number (placeholder)
        phoneNumber,
        'outbound',
        'completed',
        now,
        now
      ]);
      
      console.log(`✅ Test record created with SID: ${callSid}`);
    } else {
      console.log(`✅ Found ${specificCalls.length} calls to ${phoneNumber}`);
      specificCalls.forEach(call => {
        console.log(`  - Call SID: ${call.call_sid}, Status: ${call.status}, Time: ${call.start_time}`);
      });
    }
    
    console.log('\nTesting database transactions...');
    // Start a transaction to test if they're working properly
    await connection.beginTransaction();
    try {
      const testSid = `TEST-TRANSACTION-${Date.now()}`;
      await connection.execute(`
        INSERT INTO calls (call_sid, from_number, to_number, direction, status, start_time, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        testSid,
        '+0000000000',
        '+0000000000',
        'outbound',
        'test',
        new Date(),
        new Date()
      ]);
      
      await connection.commit();
      console.log('✅ Database transactions are working properly');
      
      // Clean up the test transaction record
      await connection.execute('DELETE FROM calls WHERE call_sid = ?', [testSid]);
    } catch (err) {
      await connection.rollback();
      console.log('❌ Database transaction test failed:', err.message);
    }
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  } finally {
    if (connection) {
      connection.end();
    }
  }
  
  console.log('\nDebug completed. Check the log for issues.');
}

// Run the debug function
debugCallHistory().catch(console.error);
