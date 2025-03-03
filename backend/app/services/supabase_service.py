import logging
import json
import httpx
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class SupabaseService:
    def __init__(self):
        pass
        
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
                
            # Use httpx for async requests
            async with httpx.AsyncClient() as client:
                # Insert rows in batches to avoid hitting request size limits
                BATCH_SIZE = 20
                results = []
                
                for i in range(0, len(rows), BATCH_SIZE):
                    batch = rows[i:i+BATCH_SIZE]
                    
                    response = await client.post(
                        f"{supabase_url}/{table_name}",
                        json=batch,
                        headers={
                            "apikey": api_key,
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                            "Prefer": "return=minimal"
                        }
                    )
                    
                    response.raise_for_status()
                    results.append(response.status_code)
                    
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
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Search for similar embeddings in Supabase
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
                
            # Construct the RPC call for vector search
            search_payload = {
                "query_embedding": query_embedding,
                "match_threshold": similarity_threshold,
                "match_count": top_k,
                "table_name": table_name
            }
            
            # Use httpx for async requests
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{rpc_url}/match_documents",
                    json=search_payload,
                    headers={
                        "apikey": api_key,
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    }
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
        table_name: str
    ) -> Dict[str, Any]:
        """
        Create a new table for storing embeddings in Supabase
        """
        try:
            # This would typically be done through Supabase's SQL editor or management tools,
            # but we can do it programmatically using the REST API's SQL endpoint
            
            supabase_url = credentials.get('url')
            api_key = credentials.get('apiKey')
            
            if not supabase_url or not api_key:
                raise ValueError("Invalid Supabase credentials")
                
            # Define the SQL to create the table and function
            sql = f"""
            -- Enable the pgvector extension if not already enabled
            CREATE EXTENSION IF NOT EXISTS vector;
            
            -- Create the embeddings table
            CREATE TABLE IF NOT EXISTS {table_name} (
                id BIGSERIAL PRIMARY KEY,
                content TEXT,
                embedding VECTOR(384),
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
            );
            
            -- Create a function to match documents
            CREATE OR REPLACE FUNCTION match_documents(
                query_embedding VECTOR(384),
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
