#!/bin/bash
API="http://localhost:42069/graphql"

echo "=== 1. AGENTS WITH URIs (sample) ==="
curl -s $API -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ agents(limit:10, where:{agentURI_not:\"\"}) { items { id owner agentURI name description active feedbackCount avgRating } } }"}' | jq '.data.agents.items'

echo -e "\n=== 2. TOP AGENTS BY FEEDBACK COUNT ==="
curl -s $API -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ agents(limit:10, orderBy:\"feedbackCount\", orderDirection:\"desc\") { items { id name feedbackCount avgRating agentURI } } }"}' | jq '.data.agents.items'

echo -e "\n=== 3. RECENT REGISTRATIONS ==="
curl -s $API -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ agents(limit:10, orderBy:\"registeredAt\", orderDirection:\"desc\") { items { id owner registeredAt agentURI } } }"}' | jq '.data.agents.items'

echo -e "\n=== 4. FEEDBACK SAMPLES ==="
curl -s $API -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ feedbacks(limit:10) { items { id agentId fromAddress score comment timestamp } } }"}' | jq '.data.feedbacks.items'

echo -e "\n=== 5. UNIQUE URI DOMAINS ==="
curl -s $API -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ agents(limit:200, where:{agentURI_not:\"\"}) { items { agentURI } } }"}' | jq -r '.data.agents.items[].agentURI' | sed 's|https\?://||' | cut -d'/' -f1 | sort | uniq -c | sort -rn | head -20
