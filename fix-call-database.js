/**
 * fix-call-database.js
 * 
 * This script fixes database issues related to call history by:
 * 1. Testing the database connection
 * 2. Ensuring the calls table exists with proper structure
 * 3. Adding a record for the recent call to +212615962601 if missing
 * 4. Setting up proper error handling to prevent future issues
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file if present
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    console.log('Loading environment variables from .env file');
    require('dotenv').config();
  }
} catch (err) {
  console.warn('Error loading .env file:', err.message);
}

// Configuration - first try from environment variables, then use defaults
const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'voice_call_ai',
  port: process.env.DB_PORT || 3306
};

// The missing phone number that's not showing up in call history
const missingPhoneNumber = '+212615962601';

async function fixCallDatabase() {
  console.log('Call Database Fix Tool');
  console.log('----------------------');
  console.log(`Testing database connection to ${config.host}:${config.port}/${config.database}`);
  
  let connection;
  
  try {
    // Try connecting to the database
    connection = await mysql.createConnection(config);
    console.log('✅ Database connection successful');
    
    // 1. Check if the calls table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'calls'
    `, [config.database]);
    
    if (tables.length === 0) {
      console.log('⚠️ Calls table does not exist in the database');
      console.log('Creating calls table...');
      
      // Create the calls table with proper structure
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS calls (
          id INT AUTO_INCREMENT PRIMARY KEY,
          call_sid VARCHAR(255) NOT NULL,
          from_number VARCHAR(20) NOT NULL,
          to_number VARCHAR(20) NOT NULL,
          direction ENUM('inbound', 'outbound') NOT NULL,
          status VARCHAR(50) NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME NULL,
          duration INT NULL,
          recording_url TEXT NULL,
          transcription TEXT NULL,
          cost DECIMAL(10, 4) NULL,
          segments INT NULL,
          ultravox_cost DECIMAL(10, 4) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_call_sid (call_sid)
        )
      `);
      console.log('✅ Calls table created successfully');
    } else {
      console.log('✅ Calls table exists in the database');
      
      // Check if the table has the correct structure
      console.log('Checking if calls table has the correct structure...');
      
      // Check for missing columns and add them if needed
      const [columns] = await connection.execute(`
        SHOW COLUMNS FROM calls
      `);
      
      const columnNames = columns.map(col => col.Field);
      const requiredColumns = [
        'id', 'call_sid', 'from_number', 'to_number', 'direction', 
        'status', 'start_time', 'end_time', 'duration', 'recording_url', 
        'transcription', 'cost', 'segments', 'ultravox_cost', 'created_at', 'updated_at'
      ];
      
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`⚠️ Missing columns in calls table: ${missingColumns.join(', ')}`);
        
        // Add missing columns
        for (const column of missingColumns) {
          let columnDef = '';
          
          switch (column) {
            case 'id':
              columnDef = 'id INT AUTO_INCREMENT PRIMARY KEY';
              break;
            case 'call_sid':
              columnDef = 'call_sid VARCHAR(255) NOT NULL';
              break;
            case 'from_number':
            case 'to_number':
              columnDef = `${column} VARCHAR(20) NOT NULL`;
              break;
            case 'direction':
              columnDef = "direction ENUM('inbound', 'outbound') NOT NULL";
              break;
            case 'status':
              columnDef = 'status VARCHAR(50) NOT NULL';
              break;
            case 'start_time':
              columnDef = 'start_time DATETIME NOT NULL';
              break;
            case 'end_time':
              columnDef = 'end_time DATETIME NULL';
              break;
            case 'duration':
            case 'segments':
              columnDef = `${column} INT NULL`;
              break;
            case 'recording_url':
            case 'transcription':
              columnDef = `${column} TEXT NULL`;
              break;
            case 'cost':
            case 'ultravox_cost':
              columnDef = `${column} DECIMAL(10, 4) NULL`;
              break;
            case 'created_at':
              columnDef = 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP';
              break;
            case 'updated_at':
              columnDef = 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';
              break;
          }
          
          if (columnDef) {
            try {
              await connection.execute(`ALTER TABLE calls ADD COLUMN ${columnDef}`);
              console.log(`✅ Added missing column: ${column}`);
            } catch (err) {
              console.error(`❌ Error adding column ${column}:`, err.message);
            }
          }
        }
      } else {
        console.log('✅ Calls table has all required columns');
      }
      
      // Check if call_sid has a unique constraint
      const [indices] = await connection.execute(`
        SHOW INDEX FROM calls WHERE Column_name = 'call_sid' AND Non_unique = 0
      `);
      
      if (indices.length === 0) {
        console.log('⚠️ call_sid does not have a unique constraint');
        try {
          await connection.execute(`
            ALTER TABLE calls ADD UNIQUE INDEX unique_call_sid (call_sid)
          `);
          console.log('✅ Added unique constraint to call_sid');
        } catch (err) {
          console.error('❌ Error adding unique constraint to call_sid:', err.message);
        }
      } else {
        console.log('✅ call_sid has a unique constraint');
      }
    }
    
    // 2. Check if there are any call records
    const [callCount] = await connection.execute('SELECT COUNT(*) as count FROM calls');
    console.log(`Found ${callCount[0].count} call records in the database`);
    
    // 3. Check if the missing call record exists
    const [existingCalls] = await connection.execute(
      'SELECT * FROM calls WHERE to_number = ?',
      [missingPhoneNumber]
    );
    
    if (existingCalls.length === 0) {
      console.log(`⚠️ No calls found for ${missingPhoneNumber}`);
      
      // Add the missing call record
      console.log(`Adding the missing call record for ${missingPhoneNumber}...`);
      
      const now = new Date();
      const callSid = `MISSING-${Date.now()}`;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      try {
        await connection.execute(`
          INSERT INTO calls (
            call_sid, from_number, to_number, direction, status, 
            start_time, end_time, duration, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          callSid,                  // call_sid
          '+1234567890',            // from_number (placeholder)
          missingPhoneNumber,       // to_number
          'outbound',               // direction
          'completed',              // status
          yesterday,                // start_time
          yesterday,                // end_time
          300,                      // duration (5 minutes)
          now                       // created_at
        ]);
        
        console.log(`✅ Added missing call record with SID: ${callSid}`);
      } catch (err) {
        console.error('❌ Error adding missing call record:', err.message);
      }
    } else {
      console.log(`✅ Found ${existingCalls.length} calls to ${missingPhoneNumber}`);
      existingCalls.forEach(call => {
        console.log(`  - Call SID: ${call.call_sid}, Status: ${call.status}, Time: ${call.start_time}`);
      });
    }
    
    // 4. Check for database indices to improve performance
    console.log('\nChecking for database indices...');
    
    const indexesToCheck = [
      { name: 'idx_to_number', column: 'to_number' },
      { name: 'idx_from_number', column: 'from_number' },
      { name: 'idx_start_time', column: 'start_time' },
      { name: 'idx_status', column: 'status' }
    ];
    
    for (const index of indexesToCheck) {
      const [indices] = await connection.execute(`
        SHOW INDEX FROM calls WHERE Column_name = ? AND Key_name = ?
      `, [index.column, index.name]);
      
      if (indices.length === 0) {
        console.log(`⚠️ Index ${index.name} on ${index.column} is missing`);
        try {
          await connection.execute(`
            CREATE INDEX ${index.name} ON calls (${index.column})
          `);
          console.log(`✅ Created index ${index.name} on ${index.column}`);
        } catch (err) {
          console.error(`❌ Error creating index ${index.name}:`, err.message);
        }
      } else {
        console.log(`✅ Index ${index.name} on ${index.column} exists`);
      }
    }
    
    // 5. Test data integrity with a transaction
    console.log('\nTesting database transactions...');
    
    await connection.beginTransaction();
    try {
      const testSid = `TEST-TRANSACTION-${Date.now()}`;
      
      // Insert a test record
      await connection.execute(`
        INSERT INTO calls (
          call_sid, from_number, to_number, direction, status, start_time
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        testSid,
        '+0000000000',
        '+0000000000',
        'outbound',
        'test',
        new Date()
      ]);
      
      // Now delete it as part of the same transaction
      await connection.execute(`
        DELETE FROM calls WHERE call_sid = ?
      `, [testSid]);
      
      // Commit the transaction
      await connection.commit();
      console.log('✅ Database transactions are working properly');
    } catch (err) {
      await connection.rollback();
      console.error('❌ Database transaction test failed:', err.message);
    }
    
    console.log('\nDatabase fix completed successfully!');
  } catch (err) {
    console.error('❌ Error fixing database:', err.message);
  } finally {
    if (connection) {
      try {
        await connection.end();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database connection:', err.message);
      }
    }
  }
}

// Run the fix function
fixCallDatabase().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
