#!/bin/bash
echo "Testing AIT Project Endpoints..."
echo ""

# Start server in background
node server.js &
SERVER_PID=$!
sleep 2

echo "1. Testing login page:"
curl -s -o /dev/null -w "   Status: %{http_code}\n" http://localhost:3001/

echo "2. Testing API session (should be 401 without login):"
curl -s -w "   Status: %{http_code}\n" http://localhost:3001/api/session

echo "3. Testing new audit-logs endpoint (should be 401):"
curl -s -w "   Status: %{http_code}\n" http://localhost:3001/api/audit-logs

echo "4. Testing new notifications endpoint (should be 401):"
curl -s -w "   Status: %{http_code}\n" http://localhost:3001/api/notifications

echo "5. Testing new analytics endpoint (should be 401):"
curl -s -w "   Status: %{http_code}\n" http://localhost:3001/api/analytics/attendance

echo ""
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null
echo "Test complete!"
