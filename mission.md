I'm going to give you a series of tasks to complete.

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
