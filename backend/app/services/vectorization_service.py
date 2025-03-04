import os
import magic
from sentence_transformers import SentenceTransformer
import PyPDF2
import docx
import pandas as pd
import logging
import tiktoken

# Set up logging
logger = logging.getLogger(__name__)

class VectorizationService:
    def __init__(self):
        # Use a better model - gte-small is more efficient and performs better
        self.model = SentenceTransformer('paraphrase-MiniLM-L6-v2')
        # Fallback to the old model if the new one fails to load
        try:
            # Try to load GTE-Small model (better for semantic search)
            self.model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            self.embedding_dimension = 384  # GTE-Small is 384 dimensions
            self.model_name = 'paraphrase-multilingual-MiniLM-L12-v2'
            logger.info("Using paraphrase-multilingual-MiniLM-L12-v2 embedding model with 384 dimensions")
        except Exception as e:
            # Fall back to MiniLM if GTE-Small fails
            logger.warning(f"Failed to load preferred embedding model: {e}. Using fallback model.")
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.embedding_dimension = 384  # MiniLM is also 384 dimensions
            self.model_name = 'all-MiniLM-L6-v2'

    def detect_file_type(self, file_path):
        """
        Detect MIME type of the file
        """
        mime = magic.Magic(mime=True)
        return mime.from_file(file_path)

    def extract_content(self, file_path):
        """
        Extract text content from various file types
        """
        file_type = self.detect_file_type(file_path)
        
        try:
            if 'pdf' in file_type:
                return self._extract_pdf(file_path)
            elif 'word' in file_type or 'document' in file_type:
                return self._extract_docx(file_path)
            elif 'sheet' in file_type or 'excel' in file_type:
                return self._extract_excel(file_path)
            elif 'text' in file_type:
                with open(file_path, 'r') as f:
                    return f.read()
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
        except Exception as e:
            raise ValueError(f"Content extraction failed: {str(e)}")

    def _extract_pdf(self, file_path):
        """
        Extract text from PDF files
        """
        with open(file_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ''
            for page in reader.pages:
                text += page.extract_text() + '\n'
            return text

    def _extract_docx(self, file_path):
        """
        Extract text from Word documents
        """
        doc = docx.Document(file_path)
        return '\n'.join([paragraph.text for paragraph in doc.paragraphs])

    def _extract_excel(self, file_path):
        """
        Extract text from Excel files
        """
        df = pd.read_excel(file_path)
        return df.to_string()

    def vectorize(self, content: str):
        """
        Generate vector embedding for text content
        """
        if not content or not content.strip():
            logger.warning("Empty content provided for vectorization")
            # Return zero vector of appropriate dimension
            return [0.0] * self.embedding_dimension
        
        try:
            # Truncate content if too long to prevent memory issues
            # Use tiktoken for accurate tokenization if available
            try:
                import tiktoken
                encoding = tiktoken.get_encoding("cl100k_base")
                tokens = encoding.encode(content)
                # Limit to 8K tokens for transformer models
                if len(tokens) > 8000:
                    # Decode truncated tokens back to text
                    truncated_content = encoding.decode(tokens[:8000])
                    logger.info(f"Content truncated from {len(tokens)} to 8000 tokens")
                else:
                    truncated_content = content
            except (ImportError, Exception) as e:
                # Fallback to character-based truncation
                max_chars = 10000
                truncated_content = content[:max_chars]
                if len(content) > max_chars:
                    logger.info(f"Content truncated from {len(content)} to {max_chars} characters")
            
            # Generate embedding
            vector = self.model.encode(truncated_content).tolist()
            return vector
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            # Return zero vector on error
            return [0.0] * self.embedding_dimension
