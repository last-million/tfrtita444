import logging
import aiomysql
import asyncio
import os
from mysql.connector import Error
from typing import List, Dict, Any, Optional
from .config import settings
from .security.password import hash_password

logger = logging.getLogger(__name__)

class DatabaseError(Exception):
    """Custom exception for database errors"""
    pass

class Database:
    def __init__(self):
        self.pool = None
        self.connected = False
        self.max_retries = 5
        self.retry_delay = 1  # seconds

    async def connect(self):
        """
        Connect to the database with retry logic
        """
        retries = 0
        while retries < self.max_retries:
            try:
                self.pool = await aiomysql.create_pool(
                    host=settings.db_host,
                    user=settings.db_user,
                    password=settings.db_password,
                    db=settings.db_database,
                    autocommit=True,
                    pool_recycle=3600,  # Recycle connections after 1 hour
                    maxsize=10,  # Maximum number of connections in the pool
                    minsize=1    # Minimum number of connections in the pool
                )
                logger.info("Successfully connected to MySQL database")
                async with self.pool.acquire() as conn:
                    async with conn.cursor() as cursor:
                        await cursor.execute("SELECT 1")
                        result = await cursor.fetchone()
                        logger.info(f"Database connection test: {result}")
                self.connected = True
                return
            except Exception as e:
                retries += 1
                logger.error(f"Error connecting to MySQL database (attempt {retries}/{self.max_retries}): {e}")
                if retries >= self.max_retries:
                    self.connected = False
                    logger.critical("Failed to connect to database after maximum retries")
                    # Raise exception in production, but allow app to continue in development
                    if not settings.debug:
                        raise DatabaseError(f"Failed to connect to database: {e}")
                else:
                    # Wait before retrying with exponential backoff
                    await asyncio.sleep(self.retry_delay * (2 ** (retries - 1)))

    async def execute(self, query: str, params: Any = None) -> List[Dict[str, Any]]:
        """
        Execute a query with retry logic
        """
        if not self.connected or not self.pool:
            if settings.debug:
                logger.warning("Database not connected, cannot execute query")
                return []
            else:
                # In production, attempt to reconnect
                await self.connect()
                if not self.connected:
                    raise DatabaseError("Database connection failed, cannot execute query")
        
        retries = 0
        while retries < self.max_retries:
            try:
                async with self.pool.acquire() as conn:
                    async with conn.cursor(aiomysql.DictCursor) as cursor:
                        await cursor.execute(query, params or ())
                        result = await cursor.fetchall()
                        return result
            except Exception as e:
                retries += 1
                logger.error(f"Database execution error (attempt {retries}/{self.max_retries}): {e}")
                if retries >= self.max_retries:
                    if settings.debug:
                        logger.error(f"Query failed after maximum retries: {query}")
                        return []
                    else:
                        raise DatabaseError(f"Query execution failed: {e}")
                else:
                    # Wait before retrying with exponential backoff
                    await asyncio.sleep(self.retry_delay * (2 ** (retries - 1)))

    async def execute_transaction(self, queries: List[Dict[str, Any]]) -> bool:
        """
        Execute multiple queries in a transaction
        Each query dict should have 'query' and optionally 'params' keys
        """
        if not self.connected or not self.pool:
            if settings.debug:
                logger.warning("Database not connected, cannot execute transaction")
                return False
            else:
                await self.connect()
                if not self.connected:
                    raise DatabaseError("Database connection failed, cannot execute transaction")
        
        retries = 0
        while retries < self.max_retries:
            try:
                async with self.pool.acquire() as conn:
                    # Disable autocommit for transaction
                    await conn.begin()
                    async with conn.cursor() as cursor:
                        for query_dict in queries:
                            await cursor.execute(
                                query_dict['query'], 
                                query_dict.get('params', ())
                            )
                    await conn.commit()
                    return True
            except Exception as e:
                retries += 1
                logger.error(f"Transaction error (attempt {retries}/{self.max_retries}): {e}")
                try:
                    await conn.rollback()
                except:
                    pass
                
                if retries >= self.max_retries:
                    if settings.debug:
                        logger.error("Transaction failed after maximum retries")
                        return False
                    else:
                        raise DatabaseError(f"Transaction execution failed: {e}")
                else:
                    # Wait before retrying with exponential backoff
                    await asyncio.sleep(self.retry_delay * (2 ** (retries - 1)))

    async def execute_migration(self, migration_file: str) -> bool:
        """
        Execute a SQL migration file
        """
        if not os.path.exists(migration_file):
            logger.error(f"Migration file not found: {migration_file}")
            return False
            
        try:
            with open(migration_file, 'r') as f:
                sql_content = f.read()
                
            # Split SQL content by semicolons to get individual statements
            # Skip empty statements
            statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]
            
            # Execute each statement in a transaction
            queries = [{'query': stmt} for stmt in statements]
            
            if await self.execute_transaction(queries):
                logger.info(f"Migration successful: {migration_file}")
                return True
            else:
                logger.error(f"Migration failed: {migration_file}")
                return False
                
        except Exception as e:
            logger.error(f"Error executing migration {migration_file}: {e}")
            return False

    async def close(self):
        """
        Close database connection pool
        """
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            self.connected = False
            logger.info("Database connection closed")

db = Database()

async def create_tables():
    """
    Create initial database tables
    """
    # Skip table creation if database is not connected
    if not db.connected or not db.pool:
        await db.connect()
        if not db.connected:
            logger.warning("Database not connected, skipping table creation")
            return
        
    try:
        queries = [
            # Create users table
            {
                'query': """
                    CREATE TABLE IF NOT EXISTS users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """
            },
            # Create error_logs table
            {
                'query': """
                    CREATE TABLE IF NOT EXISTS error_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        timestamp TIMESTAMP NOT NULL,
                        path VARCHAR(255) NOT NULL,
                        method VARCHAR(10) NOT NULL,
                        error_type VARCHAR(100) NOT NULL,
                        error_message TEXT NOT NULL,
                        traceback TEXT,
                        headers TEXT,
                        client_ip VARCHAR(45)
                    )
                """
            },
            # Create calls table
            {
                'query': """
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
                """
            }
        ]
        
        # Execute all queries in a transaction
        if await db.execute_transaction(queries):
            # Check if admin user exists
            admin_check = await db.execute("SELECT COUNT(*) as count FROM users WHERE username = 'admin'")
            if not admin_check or admin_check[0]['count'] == 0:
                # Hash the password before storing it
                hashed_password = hash_password('AFINasahbi@-11')
                await db.execute(
                    "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
                    ('admin', hashed_password)
                )
            
            # Check if hamza user exists
            hamza_check = await db.execute("SELECT COUNT(*) as count FROM users WHERE username = 'hamza'")
            if not hamza_check or hamza_check[0]['count'] == 0:
                # Hash the password before storing it
                hashed_password = hash_password('AFINasahbi@-11')
                await db.execute(
                    "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
                    ('hamza', hashed_password)
                )
                
            # Run the service tables migration if it exists
            migrations_path = os.path.join(os.path.dirname(__file__), 'migrations')
            service_tables_migration = os.path.join(migrations_path, 'create_service_tables.sql')
            
            if os.path.exists(service_tables_migration):
                await db.execute_migration(service_tables_migration)
                
            logger.info("Database tables created successfully")
            return True
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        # Don't raise the exception, allow the app to continue without DB
        return False
