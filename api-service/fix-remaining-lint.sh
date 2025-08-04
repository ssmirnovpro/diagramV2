#!/bin/bash

# Fix remaining ESLint issues systematically

echo "Fixing remaining ESLint issues..."

# Fix unused validationResult imports
sed -i '' 's/const { body, query, validationResult }/const { body, query \/\* validationResult \*\/ }/g' routes/generateV2.js
sed -i '' 's/const { query, validationResult }/const { query \/\* validationResult \*\/ }/g' routes/monitoring.js  
sed -i '' 's/const { body, validationResult }/const { body \/\* validationResult \*\/ }/g' routes/validation.js
sed -i '' 's/const { body, query, validationResult }/const { body, query \/\* validationResult \*\/ }/g' routes/webhooks.js

# Fix unused plantUMLValidator import
sed -i '' 's/generateRateLimit, plantUMLValidator, handleValidationErrors/generateRateLimit, \/\* plantUMLValidator, \*\/ handleValidationErrors/g' routes/generateV2.js

# Fix next parameter issues in route files - replace _next with next where needed
find routes/ -name "*.js" -exec sed -i '' 's/(req, res, _next) => {$/(req, res, next) => {/g' {} \;
find routes/ -name "*.js" -exec sed -i '' 's/(req, res, _next)$/(req, res, next)/g' {} \;

# Fix validationResult reference in cache.js
sed -i '' 's/validationResult/result/g' utils/cache.js

# Fix unused parameters by prefixing with underscore
sed -i '' 's/, client) => {/, _client) => {/g' utils/database.js
sed -i '' 's/, result) => {/, _result) => {/g' utils/queueManager.js
sed -i '' 's/, jobPromise) => {/, _jobPromise) => {/g' utils/queueManager.js
sed -i '' 's/const result =/const _result =/g' utils/database.js
sed -i '' 's/options = {}/options = {}/g' utils/webhookManager.js

# Fix next parameter issues in utils
find utils/ -name "*.js" -exec sed -i '' 's/(req, res, _next) => {$/(req, res, next) => {/g' {} \;
find utils/ -name "*.js" -exec sed -i '' 's/(req, _res, next)/(req, res, next)/g' {} \;

echo "Fixed common ESLint issues. Running linter to check remaining..."
npm run lint