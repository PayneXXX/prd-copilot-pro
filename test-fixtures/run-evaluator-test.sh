#!/bin/bash
# 注意：执行前确保 npm run dev 已启动

curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d @test-fixtures/evaluator-test-input.json \
  -o test-fixtures/evaluator-test-output.json \
  -w "\n\nHTTP status: %{http_code}\nTime total: %{time_total}s\n"

echo "---"
echo "Response saved to test-fixtures/evaluator-test-output.json"
echo "Preview:"
head -50 test-fixtures/evaluator-test-output.json
