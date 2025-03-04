import logging
import json
import httpx
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class SupabaseService:
    def __init__(self):
        self.client_cache = {}  # Cache for httpx clients to reuse connections
        self.timeout = httpx.Timeout(30.0, connect=10.0)  # Longer timeout for large vector operations
        
    async def get_client(self, supabase_url: str, api_key: str) -> httpx.AsyncClient:
        """Get or create an httpx client for the given Supabase URL"""
        cache_key = f"{supabase_url}:{api_key[:5]}"  # Use part of API key for the cache key
        
        if cache_key not in self.client_cache:
            logger.debug(f"Creating new httpx client for {supabase_url}")
            self.client_cache[cache_key] = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "apikey": api_key,
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
            )
        
        return self.client_cache[cache_key]

    async def store_embeddings(
        self,
        credentials: Dict[str, Any],
        table_name: str,
        text_chunks: List[str],
        embeddings: List[List[float]],
        metadata: Dict[str, Any] = {}
    ) -> Dict[str, Any]:
        """
        Store text chunks and their embeddings in Supabase
        """
        try:
            supabase_url = credentials.get('url')
            api_key = credentials.get('apiKey')
            
            if not supabase_url or not api_key:
                raise ValueError("Invalid Supabase credentials")
                
            # Make sure the URL ends with /rest/v1
            if not supabase_url.endswith('/rest/v1'):
                supabase_url = f"{supabase_url.rstrip('/')}/rest/v1"
                
            # Prepare data for insertion
            rows = []
            for i, (chunk, embedding) in enumerate(zip(text_chunks, embeddings)):
                row = {
                    "content": chunk,
                    "embedding": embedding,
                    "metadata": metadata
                }
                rows.append(row)
                
            client = await self.get_client(supabase_url, api_key)
            
            # Insert rows in batches to avoid hitting request size limits
            BATCH_SIZE = 50  # Increased from 20 for better performance
            results = []
            tasks = []
            
            # Prepare metadata with additional information
            enhanced_metadata = {
                **metadata,
                "timestamp": datetime.now().isoformat(),
                "chunk_count": len(text_chunks),
                "embedding_model": "paraphrase-multilingual-MiniLM-L12-v2"
            }
            
            # Process batches
            for i in range(0, len(rows), BATCH_SIZE):
                batch = rows[i:i+BATCH_SIZE]
                
                # Add batch index to individual row metadata
                for j, row in enumerate(batch):
                    row_metadata = row.get("metadata", {}).copy()
                    row_metadata.update({
                        "batch_index": i // BATCH_SIZE,
                        "chunk_index": i + j
                    })
                    row["metadata"] = row_metadata
                
                # Add to tasks for concurrent execution
                tasks.append(
                    client.post(
                        f"{supabase_url}/{table_name}",
                        json=batch,
                        headers={"Prefer": "return=minimal"}
                    )
                )
                
                # Execute in batches of 3 concurrent requests to avoid overwhelming the server
                if len(tasks) >= 3 or i + BATCH_SIZE >= len(rows):
                    for response in await asyncio.gather(*tasks, return_exceptions=True):
                        if isinstance(response, Exception):
                            logger.error(f"Batch insertion error: {response}")
                            results.append(False)
                        else:
                            response.raise_for_status()
                            results.append(response.status_code == 200 or response.status_code == 201)
                    tasks = []
                    
            return {
                "success": True,
                "chunks_stored": len(text_chunks),
                "table": table_name
            }
            
        except Exception as e:
            logger.error(f"Error storing embeddings in Supabase: {str(e)}")
            raise Exception(f"Supabase API error: {str(e)}")
            
    async def search_embeddings(
        self,
        credentials: Dict[str, Any],
        table_name: str,
        query_embedding: List[float],
        top_k: int = 5,
        similarity_threshold: float = 0.7,
        use_hybrid_search: bool = True,
        query_text: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar embeddings in Supabase with optional hybrid search
        """
        try:
            supabase_url = credentials.get('url')
            api_key = credentials.get('apiKey')
            
            if not supabase_url or not api_key:
                raise ValueError("Invalid Supabase credentials")
                
            # Make sure the URL ends with /rest/v1/rpc
            base_url = supabase_url.rstrip('/')
            if not base_url.endswith('/rest/v1'):
                rpc_url = f"{base_url}/rest/v1/rpc"
            else:
                rpc_url = f"{base_url}/rpc"
            
            client = await self.get_client(supabase_url, api_key)
            
            if use_hybrid_search and query_text:
                # Use hybrid search combining vector similarity with text search
                search_payload = {
                    "query_embedding": query_embedding,
                    "query_text": query_text,
                    "match_threshold": similarity_threshold,
                    "match_count": top_k,
                    "table_name": table_name
                }
                
                response = await client.post(
                    f"{rpc_url}/hybrid_search_documents",
                    json=search_payload
                )
            else:
                # Use standard vector search
                search_payload = {
                    "query_embedding": query_embedding,
                    "match_threshold": similarity_threshold,
                    "match_count": top_k,
                    "table_name": table_name
                }
                
                response = await client.post(
                    f"{rpc_url}/match_documents",
                    json=search_payload
                )
                
                response.raise_for_status()
                results = response.json()
                
                # Format the results
                formatted_results = []
                for result in results:
                    formatted_results.append({
                        "text": result.get("content", ""),
                        "similarity_score": result.get("similarity", 0),
                        "metadata": result.get("metadata", {})
                    })
                    
                return formatted_results
                
        except Exception as e:
            logger.error(f"Error searching embeddings in Supabase: {str(e)}")
            raise Exception(f"Supabase API error: {str(e)}")
            
    async def list_tables(self, credentials: Dict[str, Any]) -> List[str]:
        """
        List available tables in the Supabase database
        """
        try:
            supabase_url = credentials.get('url')
            api_key = credentials.get('apiKey')
            
            if not supabase_url or not api_key:
                raise ValueError("Invalid Supabase credentials")
                
            # Construct URL for getting tables
            if not supabase_url.endswith('/rest/v1'):
                tables_url = f"{supabase_url.rstrip('/')}/rest/v1/"
            else:
                tables_url = f"{supabase_url}/"
                
            # Use httpx for async requests
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    tables_url,
                    headers={
                        "apikey": api_key,
                        "Authorization": f"Bearer {api_key}"
                    }
                )
                
                response.raise_for_status()
                
                # Parse the response, which should be a list of tables
                tables = []
                result = response.json()
                
                if isinstance(result, dict) and 'tables' in result:
                    tables = [table.get('name') for table in result.get('tables', [])]
                elif isinstance(result, dict) and 'paths' in result:
                    tables = list(result.get('paths', {}).keys())
                elif isinstance(result, list):
                    tables = result
                
                return tables
                
        except Exception as e:
            logger.error(f"Error listing Supabase tables: {str(e)}")
            raise Exception(f"Supabase API error: {str(e)}")
    
    async def create_embeddings_table(
        self,
        credentials: Dict[str, Any],
        table_name: str,
        dimension: int = 384,
        use_hnsw: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new table for storing embeddings in Supabase with improved indexing
        """
        try:
            # This would typically be done through Supabase's SQL editor or management tools,
            # but we can do it programmatically using the REST API's SQL endpoint
            
            supabase_url = credentials.get('url')
            api_key = credentials.get('apiKey')
            
            if not supabase_url or not api_key:
                raise ValueError("Invalid Supabase credentials")
                
            # Define the SQL to create the table and functions with modern indexing
            sql = f"""
            -- Enable the pgvector extension if not already enabled
            CREATE EXTENSION IF NOT EXISTS vector;
            
            -- Create the embeddings table with text search support
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                content TEXT,
                embedding VECTOR({dimension}),
                metadata JSONB,
                ts_content TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
            );
            
            -- Create vector index (HNSW is better for larger datasets)
            {f"""
            CREATE INDEX IF NOT EXISTS {table_name}_embedding_hnsw_idx ON {table_name} 
            USING hnsw (embedding vector_cosine_ops) 
            WITH (m = 16, ef_construction = 64);
            """ if use_hnsw else f"""
            CREATE INDEX IF NOT EXISTS {table_name}_embedding_idx ON {table_name} 
            USING ivfflat (embedding vector_cosine_ops) 
            WITH (lists = 100);
            """}
            
            -- Create text search index
            CREATE INDEX IF NOT EXISTS {table_name}_ts_idx ON {table_name} USING GIN (ts_content);
            
            -- Create function for vector search
            CREATE OR REPLACE FUNCTION match_documents(
                query_embedding VECTOR({dimension}),
                match_threshold FLOAT,
                match_count INT,
                table_name TEXT
            )
            RETURNS TABLE (
                id BIGINT,
                content TEXT,
                metadata JSONB,
                similarity FLOAT
            )
            LANGUAGE plpgsql
            AS $$
            DECLARE
                table_query TEXT;
            BEGIN
                table_query := format('
                    SELECT
                        id,
                        content,
                        metadata,
                        1 - (embedding <=> %L) as similarity
                    FROM %I
                    WHERE 1 - (embedding <=> %L) > %L
                    ORDER BY similarity DESC
                    LIMIT %L
                ', query_embedding, table_name, query_embedding, match_threshold, match_count);
                
                RETURN QUERY EXECUTE table_query;
            END;
            $$;
            
            -- Create function for hybrid search (vector + text)
            CREATE OR REPLACE FUNCTION hybrid_search_documents(
                query_embedding VECTOR({dimension}),
                query_text TEXT,
                match_threshold FLOAT,
                match_count INT,
                table_name TEXT
            )
            RETURNS TABLE (
                id BIGINT,
                content TEXT,
                metadata JSONB,
                similarity FLOAT,
                text_similarity FLOAT
            )
            LANGUAGE plpgsql
            AS $$
            DECLARE
                table_query TEXT;
            BEGIN
                table_query := format('
                    SELECT
                        id,
                        content,
                        metadata,
                        1 - (embedding <=> %L) as similarity,
                        ts_rank(ts_content, websearch_to_tsquery(%L)) as text_similarity
                    FROM %I
                    WHERE 
                        1 - (embedding <=> %L) > %L
                        OR ts_content @@ websearch_to_tsquery(%L)
                    ORDER BY (1 - (embedding <=> %L)) * 0.7 + ts_rank(ts_content, websearch_to_tsquery(%L)) * 0.3 DESC
                    LIMIT %L
                ', 
                query_embedding, query_text, table_name, 
                query_embedding, match_threshold, query_text,
                query_embedding, query_text, match_count);
                
                RETURN QUERY EXECUTE table_query;
            END;
            $$;
            """
            
            # Use the SQL endpoint to execute the query
            sql_url = f"{supabase_url.rstrip('/')}/rest/v1/sql"
            
            # Use httpx for async requests
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    sql_url,
                    json={"query": sql},
                    headers={
                        "apikey": api_key,
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    }
                )
                
                response.raise_for_status()
                
                return {
                    "success": True,
                    "table_created": table_name
                }
                
        except Exception as e:
            logger.error(f"Error creating embeddings table in Supabase: {str(e)}")
            raise Exception(f"Supabase API error: {str(e)}")
