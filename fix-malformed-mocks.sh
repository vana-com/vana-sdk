#!/bin/bash

cd /workspace/packages/vana-sdk

# Fix all malformed interface definitions
echo "Fixing malformed interface definitions..."
grep -l "getTransactionReceipt: vi.fn().mockResolvedValue" src/tests/*.test.ts | while read file; do
  echo "Processing $file..."
  
  # Fix interface definitions (where it appears after waitForTransactionReceipt in interface)
  sed -i '/interface.*{/,/^}/ {
    /getTransactionReceipt: vi\.fn()\.mockResolvedValue/,+5 {
      s/getTransactionReceipt: vi\.fn()\.mockResolvedValue.*$/getTransactionReceipt: ReturnType<typeof vi.fn>;/
      /transactionHash:/d
      /blockNumber:/d
      /gasUsed:/d
      /status:/d
      /logs:/d
      /}),/d
    }
  }' "$file"
done

# Fix all malformed mock implementations
echo "Fixing malformed mock implementations..."
for file in src/tests/*.test.ts; do
  if grep -q "waitForTransactionReceipt:.*vi\.fn" "$file"; then
    echo "Checking $file for malformed mock..."
    
    # Use perl for multi-line replacements
    perl -i -0pe 's/waitForTransactionReceipt: vi\.fn\(\)\.mockResolvedValue\([^)]*\)\),\n\s+getTransactionReceipt: vi\.fn\(\)\.mockResolvedValue\(\{/waitForTransactionReceipt: vi.fn().mockResolvedValue($1),\n      getTransactionReceipt: vi.fn().mockResolvedValue({/g' "$file"
  fi
done

echo "Done!"