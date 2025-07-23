# **Vana SDK TSDoc Style Guide**

**Objective:** To ensure the Vana SDK's auto-generated API reference is consistently clear, precise, and focused on enabling developers. This is the canonical guide for all TSDoc comments within the SDK codebase.

## 1. Guiding Philosophy: The Map, Not the Compass

We maintain two sets of documentation with distinct purposes:

- **`docs.vana.org` is the Compass.** It answers the "Why" and the "How," providing conceptual understanding and end-to-end tutorials.
- **The SDK API Reference is the Map.** It answers the "What," providing precise, unambiguous, and immediate information to a developer who is actively writing code.

Every comment in the SDK must serve as a clear, accurate marker on this map. We prioritize density and accuracy over narrative.

## 2. Our Audience

When writing TSDoc, you are writing for a developer in their editor. They are:

- **The Implementer:** Needs the exact method, its parameters, and its return value. They will copy your example.
- **The Debugger:** Needs to know what a function `throws`, its edge cases, and its expected behavior.
- **The Explorer:** Scans class and method summaries to understand the SDK's surface area.

## 3. The Standardized TSDoc Structure

Adhere to this structure for all public-facing members. Consistency is key.

### **For Classes**

```typescript
/**
 * (A one-sentence summary starting with an active verb.)
 *
 * @remarks
 * (A more detailed paragraph on the class's role and key responsibilities.
 * Explain *what* it enables the developer to do. If a core Vana concept is mentioned,
 * provide a brief, self-contained explanation.)
 *
 * @category (A category for the TypeDoc sidebar, e.g., "Permissions")
 * @see For a conceptual overview, consider visiting https://docs.vana.org.
 */
export class MyController {
  /* ... */
}
```

### **Method Selection Guidance for Controllers**

When a controller has multiple methods for similar operations, include factual guidance on method selection:

```typescript
/**
 * Manages encrypted user data files and blockchain registration.
 *
 * @remarks
 * **Method Selection:**
 * - `upload()` handles encryption and blockchain registration automatically
 * - `getUserFiles()` queries existing file metadata
 * - `decryptFile()` decrypts files for which you have access
 * 
 * **Storage Requirements:**
 * Methods requiring storage configuration: `upload()`
 * Methods working without storage: `getUserFiles()`, `decryptFile()`
 *
 * @category Data Management
 */
export class DataController {
```

**Guidelines:**
- State the **primary use case** for each method objectively
- Note **configuration dependencies** that affect method availability
- Limit guidance to **3-4 key methods** to avoid overwhelming developers
- Use **factual descriptions** without subjective recommendations

### **For Methods**

The order of tags must be: summary, `@remarks`, `@param`, `@returns`, `@throws`, `@example`, `@see`.

```typescript
  /**
   * (Summary: A concise, active-verb phrase describing what the method does.)
   *
   * @remarks
   * (Optional: Critical context or side-effects the developer *must* know.
   * e.g., "This method first uploads the grant parameters to IPFS before
   * submitting the on-chain transaction.")
   *
   * @param params - (Description of the parameters object.)
   * @param params.someParam - (Description of a specific parameter's purpose, not just its type.)
   * @returns (Description of what a successful promise resolves to.)
   * @throws {ErrorClassName} - (Description of a specific, typed error that can be thrown.)
   *
   * @example
   * (A self-contained, copy-pasteable code block.)
   *
   * @see (Optional: Link to a conceptual doc page for more context.)
   */
  public async myMethod(params: MyParams): Promise<MyResult> { /* ... */ }
```

### **Enhanced Parameter Documentation**

When parameters require external acquisition or have non-obvious sources, provide factual guidance:

```typescript
/**
 * @param permissions.publicKey - The recipient's public key for encryption.
 *   Obtain via `vana.server.getIdentity(userAddress).public_key`.
 * @param permissions.grantee - The application's wallet address that will access the data.
 */
```

**Guidelines:**
- State **how to obtain** parameter values using specific SDK methods
- Clarify **which identifier** is needed when multiple exist
- Provide **factual descriptions** without assumptions about developer knowledge

### **For Types and Interfaces**

Every public property must be documented.

```typescript
/**
 * (A one-sentence summary of what this data structure represents.)
 */
export interface MyType {
  /** (A comment for *every* public property explaining its purpose.) */
  readonly someProperty: string;
}
```

## 4. Voice & Style

| Do                                                                         | Don't                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Use active voice.** "Retrieves a list of..."                             | Use passive voice. "A list of files is retrieved..."                            |
| **Be specific and concrete.** "Returns an array of `UserFile` objects."    | Be vague. "Returns the files."                                                  |
| **Use `backticks` for all technical terms.** `VRC-20`, `fileId`, `true`.   | Forget to format technical terms.                                               |
| **Start summaries with a verb.** "Grants...", "Validates...", "Uploads..." | Start with "This function is for..." or "This allows you to..."                 |
| **Describe the _purpose_ of a parameter.** `@param url - The storage URL.` | Describe the _type_ of a parameter. `@param url - A string containing the URL.` |
| **Document every public property and method.**                             | Leave exported members undocumented.                                            |
| **Throw specific, typed errors.** `throw new RelayerError(...)`            | `throw new Error('Something went wrong')`                                       |

### Terminology

- **Vana:** The network, the protocol, the company.
- **$VANA:** The native token.
- **DataDAO:** The user-facing term for a data collective. Use this in most high-level descriptions.
- **Data Liquidity Pool (DLP):** The technical, smart-contract-level term. Use only when referring specifically to the contract type or its address.
- **Gasless Transaction:** The preferred user-facing term.
- **Meta-Transaction:** The underlying technical term. Use sparingly.

## 5. Examples are Non-Negotiable

A good example is the most critical part of the documentation.

1.  **Be Self-Contained:** An example must be runnable by copying it into a file where `vana` is already initialized. Do not assume global variables exist.
2.  **Show the Happy Path:** The primary example for a method must demonstrate its most common, successful use case.
3.  **Be Realistic:** Use descriptive variable names (`const userFiles = ...`) and realistic placeholder values (`'0x...'`, `prompt: 'Analyze my...'`).
4.  **Focus on the Method:** The example must showcase the method being documented, not other features of the SDK or JavaScript.

**Correct Example:**

````typescript
/**
 * @example
 * ```typescript
 * const files = await vana.data.getUserFiles({
 *   user: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
 * });
 * files.forEach(file => console.log(`File ${file.id}: ${file.url}`));
 * ```
 */
````

## 6. Explaining Core Concepts

While the API reference should be concise, it's crucial to provide enough context for developers to understand core Vana concepts without leaving their editor.

- **Use `@remarks` for brief explanations:** When a method or class introduces a core concept (e.g., `Data Refinement`, `Proof of Contribution`), provide a one or two-sentence explanation within the `@remarks` block.
- **Prioritize clarity and self-containment:** The goal is to give the developer just enough information to use the API effectively. Avoid deep dives that are better suited for `docs.vana.org`.
- **Use `@see` for further reading:** If a concept warrants more detailed explanation, use the `@see` tag to point developers to the main documentation website as a resource for further learning.

### **Architecture Context for Complex Systems**

When documenting controllers that involve multi-step processes or dual storage patterns:

```typescript
/**
 * @remarks
 * **Permission Architecture:**
 * Permissions use dual storage: detailed parameters stored on IPFS, references stored on blockchain.
 * This enables complex permissions while maintaining minimal on-chain data.
 */
```

**Guidelines:**
- Provide **one-sentence architecture summary** when the design affects usage
- Explain **the rationale** behind architectural decisions briefly
- Focus on **what developers need to understand** to use the API correctly
- Maintain **neutral, factual tone** without justifying design choices

**Correct Usage:**

```typescript
/**
 * Initiates a data refinement process on a set of user files.
 *
 * @remarks
 * Data refinement is the process of transforming raw data into a structured and
 * privacy-preserving format using a predefined "refiner."
 *
 * @param refinerId - The ID of the refiner to use for processing.
 * @param fileIds - An array of file IDs to be refined.
 * @returns A promise that resolves with the ID of the refinement job.
 * @see For a detailed explanation of data refinement, see the [Data Refinement & Publishing](https://docs.vana.org/docs/data-refinement) guide.
 */
```

**Incorrect Usage:**

```typescript
/**
 * @remarks
 * Data refinement is a multi-stage process involving several smart contracts...
 * (This is too detailed for the API reference and will become stale.)
 */
```

## 7. Error Documentation with Recovery Information

Enhance `@throws` documentation to include factual recovery strategies when errors are user-actionable.

```typescript
/**
 * @throws {NetworkError} When IPFS gateway is unreachable.
 *   Check network connection or configure alternative gateways via `ipfsGateways`.
 * @throws {SchemaValidationError} When data format doesn't match the specified schema.
 *   Verify data structure matches schema definition from `vana.schemas.get(schemaId)`.
 * @throws {RelayerError} When gasless transaction submission fails.
 *   Retry without relayer configuration to submit direct transaction.
 */
```

**Guidelines:**
- Include **specific recovery actions** for user-actionable errors
- Reference **SDK methods or configuration options** that address the error
- Use **imperative voice** for recovery instructions ("Check...", "Configure...", "Verify...")
- Focus on **immediate next steps** rather than general troubleshooting advice

## 8. Type Consistency Documentation

When documenting APIs with different ID types or conversion requirements:

```typescript
/**
 * @param permissionId - Permission identifier as bigint for contract compatibility.
 * @remarks
 * Permission IDs use bigint while file IDs use number due to different contract architectures.
 * Convert between types using `BigInt(fileId)` when needed.
 */
```

**Guidelines:**
- **Acknowledge type differences** factually without apology
- **Provide conversion syntax** using specific utility functions
- **Explain the technical reason** briefly when it aids understanding
- **Keep explanations neutral** and focused on practical usage
