#!/bin/bash

# Combined script to apply all fixes for 502 Bad Gateway and JavaScript errors
# This script calls the individual fix scripts in the correct order

set -e

echo "=================================================="
echo "       COMPREHENSIVE FIX FOR 502 BAD GATEWAY"
echo "=================================================="
echo
echo "This script will apply all fixes in sequence to resolve"
echo "the 502 Bad Gateway errors and JavaScript issues"
echo

# Check if script is running with sudo privileges
if [ "$EUID" -ne 0 ]; then
  echo "⚠️ This script must be run with sudo. Please run: sudo ./apply_all_fixes.sh"
  exit 1
fi

# Set permissions on all fix scripts
echo "Setting execute permissions on fix scripts..."
chmod +x fix-mime-types.sh fix-call-initiate.sh fix-ultravox-integration.sh
echo "✅ Permissions set"
echo

# 1. First fix the MIME types - this is foundational for JavaScript to work correctly
echo "=================================================="
echo "STEP 1: Applying JavaScript MIME type fixes..."
echo "=================================================="
./fix-mime-types.sh
echo
echo "✅ MIME type fixes applied successfully"
echo

# 2. Fix the call initiation endpoint - this fixes the core issue
echo "=================================================="
echo "STEP 2: Applying Call Initiation endpoint fixes..."
echo "=================================================="
./fix-call-initiate.sh
echo
echo "✅ Call initiation fixes applied successfully"
echo

# 3. Fix the Ultravox integration - this addresses specific Ultravox API issues
echo "=================================================="
echo "STEP 3: Applying Ultravox integration fixes..."
echo "=================================================="
./fix-ultravox-integration.sh
echo
echo "✅ Ultravox integration fixes applied successfully"
echo

# Add a comprehensive test HTML file
DOMAIN="ajingolik.fun"
WEB_ROOT="/var/www/${DOMAIN}/html"

echo "Creating test page to verify all fixes..."
cat > "${WEB_ROOT}/test-calls.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Call API Test Page</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1, h2 {
            color: #333;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px 0;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        input {
            padding: 10px;
            width: 300px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 16px;
        }
        .result {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
            white-space: pre-wrap;
            overflow-x: auto;
        }
        .success {
            color: green;
        }
        .error {
            color: red;
        }
    </style>
</head>
<body>
    <h1>Call API Test Page</h1>
    <p>This page allows you to test if the fixes for call initiation and Ultravox integration have been successfully applied.</p>
    
    <div>
        <h2>Test Single Call</h2>
        <div>
            <label for="phoneNumber">Phone Number:</label>
            <input type="text" id="phoneNumber" value="+212615962601" placeholder="Enter phone number">
        </div>
        <div>
            <button onclick="testSingleCall()">Test Single Call</button>
        </div>
    </div>
    
    <div>
        <h2>Test Multiple Calls</h2>
        <div>
            <label for="phoneNumbers">Phone Numbers (comma separated):</label>
            <input type="text" id="phoneNumbers" value="+212615962601,+212622334455" placeholder="Enter comma-separated phone numbers">
        </div>
        <div>
            <button onclick="testMultipleCalls()">Test Multiple Calls</button>
        </div>
    </div>
    
    <div>
        <h2>Test Ultravox Integration</h2>
        <div>
            <label for="phoneNumberUltravox">Phone Number:</label>
            <input type="text" id="phoneNumberUltravox" value="+212615962601" placeholder="Enter phone number">
        </div>
        <div>
            <label for="ultravoxMediaUrl">Ultravox Media URL:</label>
            <input type="text" id="ultravoxMediaUrl" value="https://api.ultravox.ai/v1/media/9LEluyng.GXQ1zWBHvZfrCNctlIuQzK0PcjVJ4XDr" placeholder="Enter Ultravox media URL">
        </div>
        <div>
            <button onclick="testUltravoxCall()">Test Ultravox Call</button>
        </div>
    </div>
    
    <div>
        <h2>Result:</h2>
        <pre id="result" class="result">Test results will appear here</pre>
    </div>
    
    <script>
        // Function to display results
        function displayResult(data, error = null) {
            const resultElement = document.getElementById('result');
            if (error) {
                resultElement.className = 'result error';
                resultElement.textContent = 'Error: ' + error;
            } else {
                resultElement.className = 'result success';
                resultElement.textContent = JSON.stringify(data, null, 2);
            }
        }

        // Test single call
        async function testSingleCall() {
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            if (!phoneNumber) {
                displayResult(null, 'Please enter a phone number');
                return;
            }
            
            displayResult({status: 'Processing...'});
            
            try {
                // Use CallService if it exists, otherwise make a direct API call
                if (window.CallService && typeof window.CallService.initiateCall === 'function') {
                    console.log('Using CallService.initiateCall');
                    const result = await window.CallService.initiateCall(phoneNumber);
                    displayResult(result);
                } else {
                    console.log('CallService not available, making direct API call');
                    const response = await fetch('/api/calls/initiate', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({to: phoneNumber})
                    });
                    
                    const data = await response.json();
                    displayResult(data);
                }
            } catch (error) {
                displayResult(null, error.toString());
            }
        }
        
        // Test multiple calls
        async function testMultipleCalls() {
            const phoneNumbersInput = document.getElementById('phoneNumbers').value.trim();
            if (!phoneNumbersInput) {
                displayResult(null, 'Please enter at least one phone number');
                return;
            }
            
            const phoneNumbers = phoneNumbersInput.split(',').map(num => num.trim()).filter(num => num);
            
            displayResult({status: 'Processing multiple calls...'});
            
            try {
                // Use CallService if it exists, otherwise make direct API calls
                if (window.CallService && typeof window.CallService.initiateMultipleCalls === 'function') {
                    console.log('Using CallService.initiateMultipleCalls');
                    const result = await window.CallService.initiateMultipleCalls(phoneNumbers);
                    displayResult(result);
                } else {
                    console.log('CallService.initiateMultipleCalls not available, making individual API calls');
                    const results = [];
                    
                    for (const phoneNumber of phoneNumbers) {
                        const response = await fetch('/api/calls/initiate', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({to: phoneNumber})
                        });
                        
                        const data = await response.json();
                        results.push({phoneNumber, ...data});
                    }
                    
                    displayResult(results);
                }
            } catch (error) {
                displayResult(null, error.toString());
            }
        }
        
        // Test Ultravox integration
        async function testUltravoxCall() {
            const phoneNumber = document.getElementById('phoneNumberUltravox').value.trim();
            const ultravoxMediaUrl = document.getElementById('ultravoxMediaUrl').value.trim();
            
            if (!phoneNumber) {
                displayResult(null, 'Please enter a phone number');
                return;
            }
            
            displayResult({status: 'Processing Ultravox call...'});
            
            try {
                // Use CallService if it exists, otherwise make a direct API call
                if (window.CallService && typeof window.CallService.initiateCall === 'function') {
                    console.log('Using CallService.initiateCall with Ultravox media');
                    const result = await window.CallService.initiateCall(phoneNumber, {
                        ultravox_media_url: ultravoxMediaUrl
                    });
                    displayResult(result);
                } else {
                    console.log('CallService not available, making direct API call with Ultravox media');
                    const response = await fetch('/api/calls/initiate', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            to: phoneNumber, 
                            ultravox_media_url: ultravoxMediaUrl
                        })
                    });
                    
                    const data = await response.json();
                    displayResult(data);
                }
            } catch (error) {
                displayResult(null, error.toString());
            }
        }
        
        // Check if we have the patched call service
        window.addEventListener('load', function() {
            const resultElement = document.getElementById('result');
            
            if (window.CallService) {
                if (typeof window.CallService.initiateCall === 'function') {
                    resultElement.textContent = "✅ CallService is available with initiateCall method";
                    resultElement.className = 'result success';
                } else {
                    resultElement.textContent = "⚠️ CallService is available but missing initiateCall method";
                    resultElement.className = 'result error';
                }
            } else {
                resultElement.textContent = "⚠️ CallService is not available. Will use direct API calls.";
                resultElement.className = 'result error';
            }
        });
    </script>
</body>
</html>
EOF

chmod 644 "${WEB_ROOT}/test-calls.html"
chown www-data:www-data "${WEB_ROOT}/test-calls.html"

echo
echo "=================================================="
echo "             ALL FIXES COMPLETED"
echo "=================================================="
echo
echo "✅ All fixes have been successfully applied!"
echo
echo "You can verify the fixes by visiting:"
echo "https://${DOMAIN}/test-calls.html"
echo
echo "This test page allows you to:"
echo "- Test single call initiation"
echo "- Test multiple call initiation"
echo "- Test call initiation with Ultravox integration"
echo
echo "These fixes address the following issues:"
echo "1. 502 Bad Gateway errors when initiating calls"
echo "2. JavaScript MIME type issues"
echo "3. Ultravox API integration problems"
echo
echo "Your application should now work correctly without errors."
echo "=================================================="
