import os
import magic
from sentence_transformers import SentenceTransformer
import PyPDF2
import docx
import pandas as pd

class VectorizationService:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

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
        # Truncate content if too long to prevent memory issues
        max_length = 10000
        truncated_content = content[:max_length]
        
        return self.model.encode(truncated_content).tolist()
