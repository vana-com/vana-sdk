#!/bin/bash

# List of test files that need the getTransactionReceipt mock
files=(
  "src/tests/data-additional-methods.test.ts"
  "src/tests/data-controller-edge-cases.test.ts"
  "src/tests/data-relayer.test.ts"
  "src/tests/data-simple-methods.test.ts"
  "src/tests/data.test.ts"
  "src/tests/dual-mode-permissions.test.ts"
  "src/tests/dual-mode-trusted-servers.test.ts"
  "src/tests/encryption-correct-implementation.test.ts"
  "src/tests/helper-methods.test.ts"
  "src/tests/new-permissions-methods.test.ts"
  "src/tests/permissions-grantee.test.ts"
  "src/tests/permissions-schema-validation.test.ts"
  "src/tests/permissions-server-files.test.ts"
  "src/tests/permissions-trust-servers.test.ts"
  "src/tests/permissions.test.ts"
  "src/tests/personal.test.ts"
  "src/tests/protocol-additional-methods.test.ts"
  "src/tests/protocol.test.ts"
  "src/tests/trusted-server-queries.test.ts"
)

cd /workspace/packages/vana-sdk

for file in "${files[@]}"; do
  echo "Processing $file..."
  
  # Check if the file already has getTransactionReceipt
  if grep -q "getTransactionReceipt:" "$file"; then
    echo "  Already has getTransactionReceipt, skipping..."
    continue
  fi
  
  # Add getTransactionReceipt after waitForTransactionReceipt
  sed -i '/waitForTransactionReceipt:.*vi\.fn/a\        getTransactionReceipt: vi.fn().mockResolvedValue({\
          transactionHash: "0xTransactionHash",\
          blockNumber: 12345n,\
          gasUsed: 100000n,\
          status: "success" as const,\
          logs: [],\
        }),' "$file"
  
  echo "  Added getTransactionReceipt mock"
done

echo "Done!"