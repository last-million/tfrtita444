import os
import requests
import logging

logger = logging.getLogger(__name__)

class AirtableService:
    def __init__(self):
        self.api_key = os.getenv("AIRTABLE_API_KEY")
        self.base_id = os.getenv("AIRTABLE_BASE_ID")
        if not self.api_key or not self.base_id:
            logger.warning("Airtable API key or base ID not found in environment variables.")

    def get_records(self, table_name):
        """
        Fetch records from an Airtable table.
        """
        if not self.api_key or not self.base_id:
            logger.error("Airtable API key or base ID is missing.")
            return None

        url = f"https://api.airtable.com/v0/{self.base_id}/{table_name}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
            return response.json().get('records', [])
        except requests.exceptions.RequestException as e:
            logger.error(f"Airtable API request failed: {e}")
            return None

# Example usage (can be removed or commented out)
if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    
    airtable_service = AirtableService()
    if airtable_service.api_key and airtable_service.base_id:
        records = airtable_service.get_records("YourTableName")  # Replace with your table name
        if records:
            for record in records:
                logger.info(record)
        else:
            logger.warning("Could not retrieve records from Airtable.")
    else:
        logger.warning("Airtable credentials not properly configured.")
