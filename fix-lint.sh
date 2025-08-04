#!/bin/bash

# Quick fix for common linting issues

cd /Users/sergeysmirnov/projects/diagramV2

echo "Fixing trailing spaces..."
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/[[:space:]]*$//' {} \;

echo "Fixing unused validationResult imports..."
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/, validationResult}/}/' {} \;
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/validationResult, //' {} \;
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/{ validationResult }/{}/' {} \;

echo "Fixing param imports..."
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/param, //' {} \;
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/, param}/}/' {} \;

echo "Prefixing unused variables with underscore..."
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/(next)/(\_next)/' {} \;
find . -name "*.js" ! -path "./node_modules/*" ! -path "./*/node_modules/*" -exec sed -i '' 's/, next)/, \_next)/' {} \;

echo "Done!"