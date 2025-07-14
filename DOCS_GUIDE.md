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
 * Explain *what* it enables the developer to do.)
 *
 * @see For a conceptual overview, read [Conceptual Docs Link](doc:page-slug).
 * @category (A category for the TypeDoc sidebar, e.g., "Permissions")
 */
export class MyController {
  /* ... */
}
```

### **For Methods**

The order of tags must be: summary, `@remarks`, `@param`, `@returns`, `@throws`, `@example`, `@see`.

````typescript
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
  public async myMethod(params: MyParams): Promise<MyResult> { /* ... */ }```

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
````

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
- **Meta-Transaction:** The underlying technical term. Use sparingly, and link to conceptual docs if necessary.

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

## 6. Linking to Conceptual Docs (`@see`)

The API reference must not explain complex concepts. It must **link** to them. Use the `@see` tag to bridge the gap between the "What" (SDK) and the "Why" (docs.vana.org).

- **Use Case:** When you mention a core Vana concept like `Proof of Contribution`, `Data Refinement`, or `VRC-20`.
- **Format:** `* @see For more on [Concept Name], see the [conceptual docs](doc:page-slug).`

**Correct Usage:**

```typescript
/**
 * ...
 * @see For a detailed explanation of data refinement, see the [Data Refinement & Publishing](doc:data-refinement-publishing) guide.
 */
```

**Incorrect Usage:**

```typescript
/**
 * @remarks
 * Data refinement is the process of safely transforming raw input data into
 * encrypted, normalized, and queryable datasets. This is accomplished through
 * publicly documented "data refiners" defined by DataDAOs... (and so on).
 */
```

_(This is a duplication of content from `docs.vana.org` and will become stale.)_
