I'm going to give you a series of tasks to complete. Each of these justifies its own todo list so I recommend taking them on one as a time as mini projects and then referring back to this document after each one is completed and npm run validate passes (with no cheating through --no-verify, skipping tests, etc.). I expect all of this to be slowly, with patience, systematically, and without hacks or cheats. You have all the time in the world. I'm not available to help you, you just need to press on until you get it right. This needs to be done to a high standard and with the right values, e.g. inspired by the nature of this project and its audience, inspired by Stripe engineering and Viem as a prolific and successful SDK. You should commit early and often and push everything to a new branch that you should create called fix/various, just for this purpose, targeting the branch feature/data-portability-sdk-v1. if you ever end up going in circles and risk resorting to hacks or low-confidence solutions, you should record them in a parking lot document and move on, so as not to make things worse. Ultrathink each time you refer back to this document. Take your time. Signing off!

#1 - reading the right file and permission data
There is a new Subgraph. Here are the entities:
type User @entity(immutable: false) {
id: ID!
fileContributions: [DataRegistryProof!] @derivedFrom(field: "user")
"All files owned by this user"
files: [File!]! @derivedFrom(field: "owner")
"All permissions granted by this user"
permissions: [Permission!]! @derivedFrom(field: "user")
"All servers trusted by this user"
trustedServers: [TrustedServer!]! @derivedFrom(field: "user")
}

type UserTotals @entity(immutable: false) {
id: ID!

fileContributionsCount: BigInt!
}

type Dlp @entity(immutable: false) {
id: ID!
creator: Bytes
owner: Bytes
address: Bytes
treasury: Bytes
createdAt: BigInt
createdTxHash: Bytes
createdAtBlock: BigInt
performanceRating: BigInt
status: BigInt
name: String
iconUrl: String
website: String
metadata: String
token: Bytes
refiners: [Refiner!]! @derivedFrom(field: "dlp")
isVerified: Boolean
performances: [DlpPerformance!]! @derivedFrom(field: "dlp")
isRewardEligible: Boolean
rewardEligibleAt: BigInt
rewardEligibleAtBlock: BigInt
totals: Totals
}

type EpochReference @entity(immutable: false) {
id: ID!
epoch: Epoch!
}

type Epoch @entity(immutable: false) {
id: ID!
startBlock: BigInt!
endBlock: BigInt!
reward: BigInt!
createdAt: BigInt!
createdTxHash: Bytes!
createdAtBlock: BigInt!
logIndex: BigInt!
isFinalized: Boolean
dlpIds: [BigInt!]!
performances: [DlpPerformance!]! @derivedFrom(field: "epoch")
}

type FileOwner @entity(immutable: false) {
id: ID!
ownerAddress: Bytes!
}

type DataRegistryProof @entity(immutable: false) {
id: ID!
user: User # Optional for v1
dlp: Dlp # Optional for v1
epoch: Epoch!
fileId: BigInt!
proofIndex: BigInt!
createdAt: BigInt!
createdTxHash: Bytes!
createdAtBlock: BigInt!
attestor: Bytes # Optional field depending on data availability
}

type Totals @entity(immutable: false) {
id: ID!

totalFileContributions: BigInt!
uniqueFileContributors: BigInt!
}

type DlpList @entity(immutable: false) {
id: ID!
dlpIds: [String!]!
}

type Params @entity(immutable: false) {
id: ID!
daySize: BigInt!
epochSize: BigInt!
epochRewardAmount: BigInt!
}

type DlpReward @entity(immutable: false) {
id: ID!
dlpId: BigInt
epochId: BigInt
amount: BigInt
}

type Refiner @entity(immutable: false) {
id: ID!
dlp: Dlp!
owner: Bytes!
name: String!
schemaDefinitionUrl: String!
refinementInstructionUrl: String!
payments: [PaymentReceived!]! @derivedFrom(field: "refiner")
}

type PaymentReceived @entity(immutable: false) {
id: ID!
token: Bytes!
amount: BigInt!
jobId: BigInt!
refiner: Refiner!
receivedAt: BigInt!
receivedAtBlock: BigInt!
receivedTxHash: Bytes!
}

type DlpPerformance @entity(immutable: false) {
id: ID!
dlp: Dlp!
epoch: Epoch!
totalScore: BigInt!
tradingVolume: BigInt!
uniqueContributors: BigInt!
dataAccessFees: BigInt!
createdAt: BigInt!
createdTxHash: Bytes!
createdAtBlock: BigInt!
}

type File @entity(immutable: false) {
"The unique ID of the file, equivalent to the on-chain fileId."
id: ID!
"The owner of the file."
owner: User!
"The URL where the file data is stored (e.g., IPFS)."
url: String!
"The schema ID associated with this file, if any."
schemaId: BigInt!
"The block number when the file was added."
addedAtBlock: BigInt!
"The timestamp when the file was added."
addedAtTimestamp: BigInt!
"The transaction hash of the file addition."
transactionHash: Bytes!
}

type Permission @entity(immutable: false) {
"The unique ID of the permission, equivalent to the on-chain permissionId."
id: ID!
"The user who granted the permission."
user: User!
"The content identifier (e.g., IPFS URL) for the grant details."
grant: String!
"The nonce used for this permission grant."
nonce: BigInt!
"The signature provided by the user."
signature: Bytes!
"The block number when the permission was granted."
addedAtBlock: BigInt!
"The timestamp when the permission was granted."
addedAtTimestamp: BigInt!
"The transaction hash of the permission grant."
transactionHash: Bytes!
}

type TrustedServer @entity(immutable: false) {
"Composite ID: userAddress-serverAddress"
id: ID!
"The user who trusts the server."
user: User!
"The server's address (ID)."
serverAddress: Bytes!
"The URL of the server."
serverUrl: String!
"Timestamp of when the trust was established."
trustedAt: BigInt!
}

You need to redo how files and permissions are loaded by querying these new (correct) entities (in the demo app). (not by scanning the chain for permissions, which doesn't scale, and not by using the old subgraph query for files, which only gets files with proofs)

#2 - decoupling SDK relay features from HTTP/REST APIs
Right now the patterned implemented in the SDK for relayed transactions is to configure a base URL for a relay API and then make specific API requests. That is too opinionated. Instead, give users a way to specify how these submissions from users should be relayed with callback functions. If they choose to, they can make API requests to their relay APIs (and we can implement it that way for the demo app). But from the SDK's documented perspective, it could really be any mechanism that forwards the signatures and so on.

#3 - Fix problems observed in the demo app

- Generally, the copy buttons for things like file IDs should not say Copy, especially when they are inline
- All File IDs should be rendered with link buttons to the right contract (and URL hash) for reading the File ID in the block explorer for the current network, in addition to copy buttons
- Decrypt button instances should have an icon
- All files in Your Data Files table say Unknown bytes
- Error messages are not displayed properly to the user. For example (one of many), this shows up in the console when I decrypt certain files: "Failed to decrypt file: Error: Wrong encryption key. This file may have been encrypted with a different wallet or encryption seed. Try using the same wallet that originally encrypted this file." which is fine, but there is no feedback in the UI.
- Table doesn't have select all
- Grant Permission (4 files selected) is an awkward box. think about why.
- permissions table also has no select or all.
- permissions table: shield icon is weird, so is #X vs just X like the other table
- ^ operation shows as empty
- ^ files shows as "0 files" for everything
- ^ View details doesn't do anything
- revoking a permission gives: POST http://localhost:3000/api/v1/revoke 404 (Not Found) and demo-page.tsx:599 Failed to revoke permission: RelayerError: Failed to submit to relayer: Not Found in the console
- encryption & upload steps are rendered weirdly, e.g. the horizontal rules between them feel heavy
- ^ encrypt data button looks clickable but isn't until encryption key is derived
- either this section should have a "how it works" info thing like upload file to trusted server does, or neither / none should. i'm leaning toward the latter but maybe it would be good in a tooltip or something as a general pattern
- schema registry table should also have links to the contract where someone can easily see a particular schema id
- in the various tables, if there is a column that can say "discovered" that implies being able to look up records manually that e.g. aren't associated with the wallet. but I don't see the ability to do that for most tables.
- DLP ID is another think that should be linked to onchain data/contract. also copyable. Same for schema IDs and really all IDs throughout the doc.
- Download instruction icon should be different
- for some reason upload to trusted server looks clickable before i have a trusted server defined
- trusted servers aren't display in a table or anything like that, just the dropdown, meaning the full onchain information or whatever is not visible. btw leave a note in a file if the way we're looking up trusted servers is inefficient for millions of users because we have to scan over all of them (requires subgraph) or if the contract has a way to just get the ones for a user which is efficient and we can keep doing it.
- "Process with trusted server" > process what? and should this be initiated from a permission in the table? Also I think we should allow for creating permissions without parameters defined so that users can try different prompts using a single inference permission tied to certain files.
- on canonical contracts, i cant remember why multicall, multisend etc are treated differently but actually they are deployed. actions column probably goes away once the address has the link button next to it
  -overall, nav titles and titles int he content itself should programatically be the same
- spacing around these things is awkward (one of many examples):Canonical Contracts
  Reference: `protocol.getAvailableContracts()`, blockchain explorer links
  All 30 Vana protocol contracts deployed on Moksha Testnet. Click to view on block explorer. maybe you need to use better markup.
- in SDK Configuration it seems like the fields should be populated with the values used, unless they're not because the sdk isn't configured with them meaning its using its own defaults so empty is fine, I think.
- fix any definite broken features or bugs that you encounter.

#4 - better schema support
in the sdk we already use ajv and jsonschema for permission grant formatting and validation. we also need to use it for schemas. see the appendix attached below. implement that, build the right SDK features (think about the UX from the perspective of controller(s) primarily), and use them in the demo app.

#5 - Up to date documentation
These docs should not have gaps, they should be consistent with the implemented SDK features and be good quality like how Stripe and Viem write their SDK reference documentation, and considerate of who their audience is:

- typedoc docs for all SDK features
- SDK README (which is embedded in the SDK typedoc docs btw)

Appendix: schema design doc

## YKYR SQLite Schema

This is the current YKYR schema, used for data access refinements.

Onchain information (via schema registry smart contract):

- Name: Browsing Data Analytics
- Type: sqlite
- URL: `https://ipfs.ykyr.net/ipfs/QmUDXMEdDCmy5HNru97iF2pMzBRiUDjLigve3G4yqGDNCg`

Offchain information (via the URL):

```json
{
  "$schema": "https://vana.org/data-schema.json",
  "name": "Browsing Data Analytics",
  "version": "0.0.1",
  "description": "Schema for browsing data analytics, representing user browsing patterns and statistics",
  "dialect": "sqlite",
  "dialectVersion": "3",
  "schema": "CREATE TABLE auth_sources (\n\tauth_id INTEGER NOT NULL, \n\tuser_id VARCHAR NOT NULL, \n\tsource VARCHAR NOT NULL, \n\tcollection_date DATETIME NOT NULL, \n\tdata_type VARCHAR NOT NULL, \n\tPRIMARY KEY (auth_id), \n\tFOREIGN KEY(user_id) REFERENCES users (user_id)\n);\n\nCREATE TABLE browsing_authors (\n\tauthor_id VARCHAR NOT NULL, \n\tcreated_time DATETIME NOT NULL, \n\tPRIMARY KEY (author_id)\n);\n\nCREATE TABLE browsing_entries (\n\tentry_id INTEGER NOT NULL, \n\tauthor_id VARCHAR NOT NULL, \n\turl VARCHAR NOT NULL, \n\ttime_spent INTEGER NOT NULL, \n\ttimestamp DATETIME NOT NULL, \n\tPRIMARY KEY (entry_id), \n\tFOREIGN KEY(author_id) REFERENCES browsing_authors (author_id)\n);\n\nCREATE TABLE browsing_stats (\n\tstats_id INTEGER NOT NULL, \n\tauthor_id VARCHAR NOT NULL, \n\turl_count INTEGER NOT NULL, \n\taverage_time_spent FLOAT NOT NULL, \n\tbrowsing_type VARCHAR NOT NULL, \n\tPRIMARY KEY (stats_id), \n\tFOREIGN KEY(author_id) REFERENCES browsing_authors (author_id)\n);\n\nCREATE TABLE storage_metrics (\n\tmetric_id INTEGER NOT NULL, \n\tuser_id VARCHAR NOT NULL, \n\tpercent_used FLOAT NOT NULL, \n\trecorded_at DATETIME NOT NULL, \n\tPRIMARY KEY (metric_id), \n\tFOREIGN KEY(user_id) REFERENCES users (user_id)\n);\n\nCREATE TABLE users (\n\tuser_id VARCHAR NOT NULL, \n\temail VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\tlocale VARCHAR NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (user_id), \n\tUNIQUE (email)\n);"
}
```

## Instagram JSON Schema

This is a new example instagram schema that could be used with `addFileWithSchema` when adding user files to the data registry.

Onchain information (via schema registry smart contract):

- Name: Instagram Export
- Type: json
- URL: `https://instdadao.xyz/ipfs/123abc`

Offchain information (via the URL):

```json
{
  "$schema": "https://vana.org/data-schema.json",
  "name": "Instagram Export",
  "version": "0.0.1",
  "description": "Schema for a user's instagram profile data",
  "dialect": "json",
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "firstName": {
        "type": "string",
        "description": "The person's first name."
      },
      "lastName": {
        "type": "string",
        "description": "The person's last name."
      },
      "age": {
        "description": "Age in years which must be equal to or greater than zero.",
        "type": "integer",
        "minimum": 0
      }
    }
  }
}
```

## Data Contract Meta-Schema

Schemas added to the schema registry should successfully validate with this meta-schema. Generated with Gemini.

```json
{
  "$id": "https://vana.org/data-schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Data Contract",
  "description": "Meta‑schema that validates a data contract object containing a dataset schema and related metadata.",
  "type": "object",
  "required": ["name", "version", "dialect", "schema"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Human‑readable name of the contract."
    },
    "version": {
      "type": "string",
      "description": "Semantic version of the contract's business logic (e.g. 1.1.0)."
    },
    "description": {
      "type": "string",
      "description": "Long‑form description of the dataset or API."
    },
    "dialect": {
      "type": "string",
      "description": "Primary language/format of the data schema.",
      "enum": ["sqlite", "json"]
    },
    "dialectVersion": {
      "type": "string",
      "description": "Optional: The version of the dialect's engine or specification the schema targets (e.g., '3' for SQLite v3). Omit for self-describing dialects like json."
    },
    "schema": {
      "description": "The actual schema definition. For 'sqlite', supply a DDL string; for 'json', embed a JSON Schema object.",
      "oneOf": [{ "type": "string" }, { "type": "object" }]
    }
  },
  "additionalProperties": false,
  "allOf": [
    {
      "if": {
        "properties": { "dialect": { "const": "sqlite" } }
      },
      "then": {
        "properties": { "schema": { "type": "string" } }
      }
    },
    {
      "if": {
        "properties": { "dialect": { "const": "json" } }
      },
      "then": {
        "properties": { "schema": { "type": "object" } }
      }
    }
  ]
}
```

All JSON schemas should follow the [https://json-schema.org](https://json-schema.org/learn/miscellaneous-examples) standard.
