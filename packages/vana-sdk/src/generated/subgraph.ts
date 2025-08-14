import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  BigDecimal: { input: string; output: string };
  BigInt: { input: string; output: string };
  Bytes: { input: string; output: string };
  Int8: { input: any; output: any };
  Timestamp: { input: any; output: any };
};

export type Aggregation_Interval = "day" | "hour";

export type BlockChangedFilter = {
  number_gte: Scalars["Int"]["input"];
};

export type Block_Height = {
  hash?: InputMaybe<Scalars["Bytes"]["input"]>;
  number?: InputMaybe<Scalars["Int"]["input"]>;
  number_gte?: InputMaybe<Scalars["Int"]["input"]>;
};

export type Bundle = {
  ethPriceUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
};

export type Bundle_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Bundle_Filter>>>;
  ethPriceUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  ethPriceUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  ethPriceUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Bundle_Filter>>>;
};

export type Bundle_OrderBy = "ethPriceUSD" | "id";

export type Burn = {
  amount: Scalars["BigInt"]["output"];
  amount0: Scalars["BigDecimal"]["output"];
  amount1: Scalars["BigDecimal"]["output"];
  amountUSD?: Maybe<Scalars["BigDecimal"]["output"]>;
  id: Scalars["ID"]["output"];
  logIndex?: Maybe<Scalars["BigInt"]["output"]>;
  origin: Scalars["Bytes"]["output"];
  owner?: Maybe<Scalars["Bytes"]["output"]>;
  pool: Pool;
  tickLower: Scalars["BigInt"]["output"];
  tickUpper: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  token0: Token;
  token1: Token;
  transaction: Transaction;
};

export type Burn_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  amount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Burn_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Burn_Filter>>>;
  origin?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  origin_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  tickLower?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickLower_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token0?: InputMaybe<Scalars["String"]["input"]>;
  token0_?: InputMaybe<Token_Filter>;
  token0_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_gt?: InputMaybe<Scalars["String"]["input"]>;
  token0_gte?: InputMaybe<Scalars["String"]["input"]>;
  token0_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_lt?: InputMaybe<Scalars["String"]["input"]>;
  token0_lte?: InputMaybe<Scalars["String"]["input"]>;
  token0_not?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1?: InputMaybe<Scalars["String"]["input"]>;
  token1_?: InputMaybe<Token_Filter>;
  token1_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_gt?: InputMaybe<Scalars["String"]["input"]>;
  token1_gte?: InputMaybe<Scalars["String"]["input"]>;
  token1_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_lt?: InputMaybe<Scalars["String"]["input"]>;
  token1_lte?: InputMaybe<Scalars["String"]["input"]>;
  token1_not?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction?: InputMaybe<Scalars["String"]["input"]>;
  transaction_?: InputMaybe<Transaction_Filter>;
  transaction_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_lt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_lte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Burn_OrderBy =
  | "amount"
  | "amount0"
  | "amount1"
  | "amountUSD"
  | "id"
  | "logIndex"
  | "origin"
  | "owner"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "tickLower"
  | "tickUpper"
  | "timestamp"
  | "token0"
  | "token0__decimals"
  | "token0__derivedETH"
  | "token0__feesUSD"
  | "token0__id"
  | "token0__name"
  | "token0__poolCount"
  | "token0__symbol"
  | "token0__totalSupply"
  | "token0__totalValueLocked"
  | "token0__totalValueLockedUSD"
  | "token0__totalValueLockedUSDUntracked"
  | "token0__txCount"
  | "token0__untrackedVolumeUSD"
  | "token0__volume"
  | "token0__volumeUSD"
  | "token1"
  | "token1__decimals"
  | "token1__derivedETH"
  | "token1__feesUSD"
  | "token1__id"
  | "token1__name"
  | "token1__poolCount"
  | "token1__symbol"
  | "token1__totalSupply"
  | "token1__totalValueLocked"
  | "token1__totalValueLockedUSD"
  | "token1__totalValueLockedUSDUntracked"
  | "token1__txCount"
  | "token1__untrackedVolumeUSD"
  | "token1__volume"
  | "token1__volumeUSD"
  | "transaction"
  | "transaction__blockNumber"
  | "transaction__gasPrice"
  | "transaction__gasUsed"
  | "transaction__id"
  | "transaction__timestamp";

export type Collect = {
  amount0: Scalars["BigDecimal"]["output"];
  amount1: Scalars["BigDecimal"]["output"];
  amountUSD?: Maybe<Scalars["BigDecimal"]["output"]>;
  id: Scalars["ID"]["output"];
  logIndex?: Maybe<Scalars["BigInt"]["output"]>;
  owner?: Maybe<Scalars["Bytes"]["output"]>;
  pool: Pool;
  tickLower: Scalars["BigInt"]["output"];
  tickUpper: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  transaction: Transaction;
};

export type Collect_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Collect_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Collect_Filter>>>;
  owner?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  tickLower?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickLower_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  transaction?: InputMaybe<Scalars["String"]["input"]>;
  transaction_?: InputMaybe<Transaction_Filter>;
  transaction_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_lt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_lte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Collect_OrderBy =
  | "amount0"
  | "amount1"
  | "amountUSD"
  | "id"
  | "logIndex"
  | "owner"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "tickLower"
  | "tickUpper"
  | "timestamp"
  | "transaction"
  | "transaction__blockNumber"
  | "transaction__gasPrice"
  | "transaction__gasUsed"
  | "transaction__id"
  | "transaction__timestamp";

export type DataRegistryProof = {
  attestor?: Maybe<Scalars["Bytes"]["output"]>;
  createdAt: Scalars["BigInt"]["output"];
  createdAtBlock: Scalars["BigInt"]["output"];
  createdTxHash: Scalars["Bytes"]["output"];
  dlp?: Maybe<Dlp>;
  epoch: Epoch;
  fileId: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  proofIndex: Scalars["BigInt"]["output"];
  user?: Maybe<User>;
};

export type DataRegistryProof_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<DataRegistryProof_Filter>>>;
  attestor?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  attestor_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  attestor_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  dlp?: InputMaybe<Scalars["String"]["input"]>;
  dlp_?: InputMaybe<Dlp_Filter>;
  dlp_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_lt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_lte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch?: InputMaybe<Scalars["String"]["input"]>;
  epoch_?: InputMaybe<Epoch_Filter>;
  epoch_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_lt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_lte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  fileId?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  fileId_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileId_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<DataRegistryProof_Filter>>>;
  proofIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  proofIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  proofIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  user?: InputMaybe<Scalars["String"]["input"]>;
  user_?: InputMaybe<User_Filter>;
  user_contains?: InputMaybe<Scalars["String"]["input"]>;
  user_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  user_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_gt?: InputMaybe<Scalars["String"]["input"]>;
  user_gte?: InputMaybe<Scalars["String"]["input"]>;
  user_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  user_lt?: InputMaybe<Scalars["String"]["input"]>;
  user_lte?: InputMaybe<Scalars["String"]["input"]>;
  user_not?: InputMaybe<Scalars["String"]["input"]>;
  user_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  user_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  user_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  user_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  user_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  user_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type DataRegistryProof_OrderBy =
  | "attestor"
  | "createdAt"
  | "createdAtBlock"
  | "createdTxHash"
  | "dlp"
  | "dlp__address"
  | "dlp__createdAt"
  | "dlp__createdAtBlock"
  | "dlp__createdTxHash"
  | "dlp__creator"
  | "dlp__iconUrl"
  | "dlp__id"
  | "dlp__metadata"
  | "dlp__name"
  | "dlp__owner"
  | "dlp__performanceRating"
  | "dlp__status"
  | "dlp__token"
  | "dlp__treasury"
  | "dlp__verificationBlockNumber"
  | "dlp__website"
  | "epoch"
  | "epoch__createdAt"
  | "epoch__createdAtBlock"
  | "epoch__createdTxHash"
  | "epoch__endBlock"
  | "epoch__id"
  | "epoch__isFinalized"
  | "epoch__logIndex"
  | "epoch__reward"
  | "epoch__startBlock"
  | "fileId"
  | "id"
  | "proofIndex"
  | "user"
  | "user__id";

export type Dlp = {
  address?: Maybe<Scalars["Bytes"]["output"]>;
  createdAt?: Maybe<Scalars["BigInt"]["output"]>;
  createdAtBlock?: Maybe<Scalars["BigInt"]["output"]>;
  createdTxHash?: Maybe<Scalars["Bytes"]["output"]>;
  creator?: Maybe<Scalars["Bytes"]["output"]>;
  iconUrl?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  metadata?: Maybe<Scalars["String"]["output"]>;
  name?: Maybe<Scalars["String"]["output"]>;
  owner?: Maybe<Scalars["Bytes"]["output"]>;
  performanceRating?: Maybe<Scalars["BigInt"]["output"]>;
  performances: Array<DlpPerformance>;
  refiners: Array<Refiner>;
  status?: Maybe<Scalars["BigInt"]["output"]>;
  token?: Maybe<Scalars["Bytes"]["output"]>;
  totals?: Maybe<Totals>;
  treasury?: Maybe<Scalars["Bytes"]["output"]>;
  verificationBlockNumber?: Maybe<Scalars["BigInt"]["output"]>;
  website?: Maybe<Scalars["String"]["output"]>;
};

export type DlpPerformancesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpPerformance_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<DlpPerformance_Filter>;
};

export type DlpRefinersArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Refiner_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Refiner_Filter>;
};

export type DlpList = {
  dlpIds: Array<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
};

export type DlpList_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<DlpList_Filter>>>;
  dlpIds?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlpIds_contains?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlpIds_contains_nocase?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlpIds_not?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlpIds_not_contains?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlpIds_not_contains_nocase?: InputMaybe<Array<Scalars["String"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<DlpList_Filter>>>;
};

export type DlpList_OrderBy = "dlpIds" | "id";

export type DlpPerformance = {
  createdAt: Scalars["BigInt"]["output"];
  createdAtBlock: Scalars["BigInt"]["output"];
  createdTxHash: Scalars["Bytes"]["output"];
  dataAccessFees: Scalars["BigInt"]["output"];
  dlp: Dlp;
  epoch: Epoch;
  id: Scalars["ID"]["output"];
  totalScore: Scalars["BigInt"]["output"];
  tradingVolume: Scalars["BigInt"]["output"];
  uniqueContributors: Scalars["BigInt"]["output"];
};

export type DlpPerformance_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<DlpPerformance_Filter>>>;
  createdAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  dataAccessFees?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dataAccessFees_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  dataAccessFees_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlp?: InputMaybe<Scalars["String"]["input"]>;
  dlp_?: InputMaybe<Dlp_Filter>;
  dlp_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_lt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_lte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch?: InputMaybe<Scalars["String"]["input"]>;
  epoch_?: InputMaybe<Epoch_Filter>;
  epoch_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_lt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_lte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<DlpPerformance_Filter>>>;
  totalScore?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  totalScore_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalScore_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tradingVolume?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tradingVolume_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tradingVolume_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  uniqueContributors?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  uniqueContributors_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueContributors_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
};

export type DlpPerformance_OrderBy =
  | "createdAt"
  | "createdAtBlock"
  | "createdTxHash"
  | "dataAccessFees"
  | "dlp"
  | "dlp__address"
  | "dlp__createdAt"
  | "dlp__createdAtBlock"
  | "dlp__createdTxHash"
  | "dlp__creator"
  | "dlp__iconUrl"
  | "dlp__id"
  | "dlp__metadata"
  | "dlp__name"
  | "dlp__owner"
  | "dlp__performanceRating"
  | "dlp__status"
  | "dlp__token"
  | "dlp__treasury"
  | "dlp__verificationBlockNumber"
  | "dlp__website"
  | "epoch"
  | "epoch__createdAt"
  | "epoch__createdAtBlock"
  | "epoch__createdTxHash"
  | "epoch__endBlock"
  | "epoch__id"
  | "epoch__isFinalized"
  | "epoch__logIndex"
  | "epoch__reward"
  | "epoch__startBlock"
  | "id"
  | "totalScore"
  | "tradingVolume"
  | "uniqueContributors";

export type DlpReward = {
  amount?: Maybe<Scalars["BigInt"]["output"]>;
  dlpId?: Maybe<Scalars["BigInt"]["output"]>;
  epochId?: Maybe<Scalars["BigInt"]["output"]>;
  id: Scalars["ID"]["output"];
};

export type DlpReward_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  amount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<DlpReward_Filter>>>;
  dlpId?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpId_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  dlpId_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochId?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochId_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochId_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<DlpReward_Filter>>>;
};

export type DlpReward_OrderBy = "amount" | "dlpId" | "epochId" | "id";

export type Dlp_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  address?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  address_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Dlp_Filter>>>;
  createdAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  creator?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  creator_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  creator_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  iconUrl?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_contains?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_gt?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_gte?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  iconUrl_lt?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_lte?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  iconUrl_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  iconUrl_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  metadata?: InputMaybe<Scalars["String"]["input"]>;
  metadata_contains?: InputMaybe<Scalars["String"]["input"]>;
  metadata_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  metadata_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  metadata_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  metadata_gt?: InputMaybe<Scalars["String"]["input"]>;
  metadata_gte?: InputMaybe<Scalars["String"]["input"]>;
  metadata_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  metadata_lt?: InputMaybe<Scalars["String"]["input"]>;
  metadata_lte?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  metadata_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  metadata_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  metadata_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  metadata_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  name_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_gt?: InputMaybe<Scalars["String"]["input"]>;
  name_gte?: InputMaybe<Scalars["String"]["input"]>;
  name_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_lt?: InputMaybe<Scalars["String"]["input"]>;
  name_lte?: InputMaybe<Scalars["String"]["input"]>;
  name_not?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  or?: InputMaybe<Array<InputMaybe<Dlp_Filter>>>;
  owner?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  performanceRating?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  performanceRating_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  performanceRating_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  performances_?: InputMaybe<DlpPerformance_Filter>;
  refiners_?: InputMaybe<Refiner_Filter>;
  status?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  status_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  status_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  token_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  totals?: InputMaybe<Scalars["String"]["input"]>;
  totals_?: InputMaybe<Totals_Filter>;
  totals_contains?: InputMaybe<Scalars["String"]["input"]>;
  totals_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totals_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  totals_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totals_gt?: InputMaybe<Scalars["String"]["input"]>;
  totals_gte?: InputMaybe<Scalars["String"]["input"]>;
  totals_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  totals_lt?: InputMaybe<Scalars["String"]["input"]>;
  totals_lte?: InputMaybe<Scalars["String"]["input"]>;
  totals_not?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  totals_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  totals_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totals_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  totals_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  treasury?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  treasury_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  treasury_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  verificationBlockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  verificationBlockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  verificationBlockNumber_not_in?: InputMaybe<
    Array<Scalars["BigInt"]["input"]>
  >;
  website?: InputMaybe<Scalars["String"]["input"]>;
  website_contains?: InputMaybe<Scalars["String"]["input"]>;
  website_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  website_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  website_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  website_gt?: InputMaybe<Scalars["String"]["input"]>;
  website_gte?: InputMaybe<Scalars["String"]["input"]>;
  website_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  website_lt?: InputMaybe<Scalars["String"]["input"]>;
  website_lte?: InputMaybe<Scalars["String"]["input"]>;
  website_not?: InputMaybe<Scalars["String"]["input"]>;
  website_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  website_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  website_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  website_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  website_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  website_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  website_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  website_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  website_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Dlp_OrderBy =
  | "address"
  | "createdAt"
  | "createdAtBlock"
  | "createdTxHash"
  | "creator"
  | "iconUrl"
  | "id"
  | "metadata"
  | "name"
  | "owner"
  | "performanceRating"
  | "performances"
  | "refiners"
  | "status"
  | "token"
  | "totals"
  | "totals__dataAccessFees"
  | "totals__id"
  | "totals__totalFileContributions"
  | "totals__uniqueFileContributors"
  | "treasury"
  | "verificationBlockNumber"
  | "website";

export type Epoch = {
  createdAt: Scalars["BigInt"]["output"];
  createdAtBlock: Scalars["BigInt"]["output"];
  createdTxHash: Scalars["Bytes"]["output"];
  dlpIds: Array<Scalars["BigInt"]["output"]>;
  endBlock: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  isFinalized?: Maybe<Scalars["Boolean"]["output"]>;
  logIndex: Scalars["BigInt"]["output"];
  performances: Array<DlpPerformance>;
  reward: Scalars["BigInt"]["output"];
  startBlock: Scalars["BigInt"]["output"];
};

export type EpochPerformancesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpPerformance_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<DlpPerformance_Filter>;
};

export type EpochReference = {
  epoch: Epoch;
  id: Scalars["ID"]["output"];
};

export type EpochReference_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<EpochReference_Filter>>>;
  epoch?: InputMaybe<Scalars["String"]["input"]>;
  epoch_?: InputMaybe<Epoch_Filter>;
  epoch_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_gte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_lt?: InputMaybe<Scalars["String"]["input"]>;
  epoch_lte?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  epoch_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  epoch_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<EpochReference_Filter>>>;
};

export type EpochReference_OrderBy =
  | "epoch"
  | "epoch__createdAt"
  | "epoch__createdAtBlock"
  | "epoch__createdTxHash"
  | "epoch__endBlock"
  | "epoch__id"
  | "epoch__isFinalized"
  | "epoch__logIndex"
  | "epoch__reward"
  | "epoch__startBlock"
  | "id";

export type Epoch_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Epoch_Filter>>>;
  createdAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  dlpIds?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpIds_contains?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpIds_contains_nocase?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpIds_not?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpIds_not_contains?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  dlpIds_not_contains_nocase?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  endBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  endBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  isFinalized?: InputMaybe<Scalars["Boolean"]["input"]>;
  isFinalized_in?: InputMaybe<Array<Scalars["Boolean"]["input"]>>;
  isFinalized_not?: InputMaybe<Scalars["Boolean"]["input"]>;
  isFinalized_not_in?: InputMaybe<Array<Scalars["Boolean"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Epoch_Filter>>>;
  performances_?: InputMaybe<DlpPerformance_Filter>;
  reward?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  reward_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  reward_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  startBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  startBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
};

export type Epoch_OrderBy =
  | "createdAt"
  | "createdAtBlock"
  | "createdTxHash"
  | "dlpIds"
  | "endBlock"
  | "id"
  | "isFinalized"
  | "logIndex"
  | "performances"
  | "reward"
  | "startBlock";

export type Factory = {
  id: Scalars["ID"]["output"];
  owner: Scalars["ID"]["output"];
  poolCount: Scalars["BigInt"]["output"];
  totalFeesETH: Scalars["BigDecimal"]["output"];
  totalFeesUSD: Scalars["BigDecimal"]["output"];
  totalValueLockedETH: Scalars["BigDecimal"]["output"];
  totalValueLockedETHUntracked: Scalars["BigDecimal"]["output"];
  totalValueLockedUSD: Scalars["BigDecimal"]["output"];
  totalValueLockedUSDUntracked: Scalars["BigDecimal"]["output"];
  totalVolumeETH: Scalars["BigDecimal"]["output"];
  totalVolumeUSD: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  untrackedVolumeUSD: Scalars["BigDecimal"]["output"];
};

export type Factory_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Factory_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Factory_Filter>>>;
  owner?: InputMaybe<Scalars["ID"]["input"]>;
  owner_gt?: InputMaybe<Scalars["ID"]["input"]>;
  owner_gte?: InputMaybe<Scalars["ID"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["ID"]["input"]>;
  owner_lte?: InputMaybe<Scalars["ID"]["input"]>;
  owner_not?: InputMaybe<Scalars["ID"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  poolCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  poolCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  totalFeesETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalFeesETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesETH_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalFeesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalFeesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalFeesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedETHUntracked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETHUntracked_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSDUntracked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalVolumeETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalVolumeETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeETH_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  untrackedVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type Factory_OrderBy =
  | "id"
  | "owner"
  | "poolCount"
  | "totalFeesETH"
  | "totalFeesUSD"
  | "totalValueLockedETH"
  | "totalValueLockedETHUntracked"
  | "totalValueLockedUSD"
  | "totalValueLockedUSDUntracked"
  | "totalVolumeETH"
  | "totalVolumeUSD"
  | "txCount"
  | "untrackedVolumeUSD";

export type File = {
  /** The block number when the file was added. */
  addedAtBlock: Scalars["BigInt"]["output"];
  /** The timestamp when the file was added. */
  addedAtTimestamp: Scalars["BigInt"]["output"];
  /** The unique ID of the file, equivalent to the on-chain fileId. */
  id: Scalars["ID"]["output"];
  /** The owner of the file. */
  owner: User;
  /** The schema ID associated with this file, if any. */
  schemaId: Scalars["BigInt"]["output"];
  /** The transaction hash of the file addition. */
  transactionHash: Scalars["Bytes"]["output"];
  /** The URL where the file data is stored (e.g., IPFS). */
  url: Scalars["String"]["output"];
};

export type File_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  addedAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<File_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<File_Filter>>>;
  owner?: InputMaybe<Scalars["String"]["input"]>;
  owner_?: InputMaybe<User_Filter>;
  owner_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_gt?: InputMaybe<Scalars["String"]["input"]>;
  owner_gte?: InputMaybe<Scalars["String"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["String"]["input"]>;
  owner_lte?: InputMaybe<Scalars["String"]["input"]>;
  owner_not?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schemaId?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  schemaId_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  schemaId_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  url?: InputMaybe<Scalars["String"]["input"]>;
  url_contains?: InputMaybe<Scalars["String"]["input"]>;
  url_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  url_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_gt?: InputMaybe<Scalars["String"]["input"]>;
  url_gte?: InputMaybe<Scalars["String"]["input"]>;
  url_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  url_lt?: InputMaybe<Scalars["String"]["input"]>;
  url_lte?: InputMaybe<Scalars["String"]["input"]>;
  url_not?: InputMaybe<Scalars["String"]["input"]>;
  url_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  url_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  url_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  url_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  url_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  url_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type File_OrderBy =
  | "addedAtBlock"
  | "addedAtTimestamp"
  | "id"
  | "owner"
  | "owner__id"
  | "schemaId"
  | "transactionHash"
  | "url";

export type Flash = {
  amount0: Scalars["BigDecimal"]["output"];
  amount0Paid: Scalars["BigDecimal"]["output"];
  amount1: Scalars["BigDecimal"]["output"];
  amount1Paid: Scalars["BigDecimal"]["output"];
  amountUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  logIndex?: Maybe<Scalars["BigInt"]["output"]>;
  pool: Pool;
  recipient: Scalars["Bytes"]["output"];
  sender: Scalars["Bytes"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  transaction: Transaction;
};

export type Flash_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0Paid_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0Paid_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1Paid_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1Paid_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Flash_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Flash_Filter>>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  recipient?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  recipient_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sender?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sender_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  transaction?: InputMaybe<Scalars["String"]["input"]>;
  transaction_?: InputMaybe<Transaction_Filter>;
  transaction_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_lt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_lte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Flash_OrderBy =
  | "amount0"
  | "amount0Paid"
  | "amount1"
  | "amount1Paid"
  | "amountUSD"
  | "id"
  | "logIndex"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "recipient"
  | "sender"
  | "timestamp"
  | "transaction"
  | "transaction__blockNumber"
  | "transaction__gasPrice"
  | "transaction__gasUsed"
  | "transaction__id"
  | "transaction__timestamp";

export type Grantee = {
  /** The address of the grantee. */
  address: Scalars["Bytes"]["output"];
  /** The unique ID of the grantee, equivalent to the on-chain granteeId. */
  id: Scalars["ID"]["output"];
  /** The owner who registered this grantee. */
  owner: User;
  /** Permissions associated with this grantee. */
  permissions: Array<Permission>;
  /** The public key of the grantee. */
  publicKey: Scalars["String"]["output"];
  /** The block number when the grantee was registered. */
  registeredAtBlock: Scalars["BigInt"]["output"];
  /** The timestamp when the grantee was registered. */
  registeredAtTimestamp: Scalars["BigInt"]["output"];
  /** The transaction hash of the grantee registration. */
  transactionHash: Scalars["Bytes"]["output"];
};

export type GranteePermissionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Permission_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Permission_Filter>;
};

export type Grantee_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  address?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  address_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  address_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Grantee_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Grantee_Filter>>>;
  owner?: InputMaybe<Scalars["String"]["input"]>;
  owner_?: InputMaybe<User_Filter>;
  owner_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_gt?: InputMaybe<Scalars["String"]["input"]>;
  owner_gte?: InputMaybe<Scalars["String"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["String"]["input"]>;
  owner_lte?: InputMaybe<Scalars["String"]["input"]>;
  owner_not?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permissions_?: InputMaybe<Permission_Filter>;
  publicKey?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_contains?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_gt?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_gte?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  publicKey_lt?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_lte?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  publicKey_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  publicKey_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  registeredAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export type Grantee_OrderBy =
  | "address"
  | "id"
  | "owner"
  | "owner__id"
  | "permissions"
  | "publicKey"
  | "registeredAtBlock"
  | "registeredAtTimestamp"
  | "transactionHash";

export type Mint = {
  amount: Scalars["BigInt"]["output"];
  amount0: Scalars["BigDecimal"]["output"];
  amount1: Scalars["BigDecimal"]["output"];
  amountUSD?: Maybe<Scalars["BigDecimal"]["output"]>;
  id: Scalars["ID"]["output"];
  logIndex?: Maybe<Scalars["BigInt"]["output"]>;
  origin: Scalars["Bytes"]["output"];
  owner: Scalars["Bytes"]["output"];
  pool: Pool;
  sender?: Maybe<Scalars["Bytes"]["output"]>;
  tickLower: Scalars["BigInt"]["output"];
  tickUpper: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  token0: Token;
  token1: Token;
  transaction: Transaction;
};

export type Mint_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  amount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Mint_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Mint_Filter>>>;
  origin?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  origin_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  sender?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sender_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  tickLower?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickLower_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickLower_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickUpper_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickUpper_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token0?: InputMaybe<Scalars["String"]["input"]>;
  token0_?: InputMaybe<Token_Filter>;
  token0_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_gt?: InputMaybe<Scalars["String"]["input"]>;
  token0_gte?: InputMaybe<Scalars["String"]["input"]>;
  token0_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_lt?: InputMaybe<Scalars["String"]["input"]>;
  token0_lte?: InputMaybe<Scalars["String"]["input"]>;
  token0_not?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1?: InputMaybe<Scalars["String"]["input"]>;
  token1_?: InputMaybe<Token_Filter>;
  token1_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_gt?: InputMaybe<Scalars["String"]["input"]>;
  token1_gte?: InputMaybe<Scalars["String"]["input"]>;
  token1_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_lt?: InputMaybe<Scalars["String"]["input"]>;
  token1_lte?: InputMaybe<Scalars["String"]["input"]>;
  token1_not?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction?: InputMaybe<Scalars["String"]["input"]>;
  transaction_?: InputMaybe<Transaction_Filter>;
  transaction_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_lt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_lte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Mint_OrderBy =
  | "amount"
  | "amount0"
  | "amount1"
  | "amountUSD"
  | "id"
  | "logIndex"
  | "origin"
  | "owner"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "sender"
  | "tickLower"
  | "tickUpper"
  | "timestamp"
  | "token0"
  | "token0__decimals"
  | "token0__derivedETH"
  | "token0__feesUSD"
  | "token0__id"
  | "token0__name"
  | "token0__poolCount"
  | "token0__symbol"
  | "token0__totalSupply"
  | "token0__totalValueLocked"
  | "token0__totalValueLockedUSD"
  | "token0__totalValueLockedUSDUntracked"
  | "token0__txCount"
  | "token0__untrackedVolumeUSD"
  | "token0__volume"
  | "token0__volumeUSD"
  | "token1"
  | "token1__decimals"
  | "token1__derivedETH"
  | "token1__feesUSD"
  | "token1__id"
  | "token1__name"
  | "token1__poolCount"
  | "token1__symbol"
  | "token1__totalSupply"
  | "token1__totalValueLocked"
  | "token1__totalValueLockedUSD"
  | "token1__totalValueLockedUSDUntracked"
  | "token1__txCount"
  | "token1__untrackedVolumeUSD"
  | "token1__volume"
  | "token1__volumeUSD"
  | "transaction"
  | "transaction__blockNumber"
  | "transaction__gasPrice"
  | "transaction__gasUsed"
  | "transaction__id"
  | "transaction__timestamp";

/** Defines the order direction, either ascending or descending */
export type OrderDirection = "asc" | "desc";

export type Params = {
  daySize: Scalars["BigInt"]["output"];
  epochRewardAmount: Scalars["BigInt"]["output"];
  epochSize: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
};

export type Params_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Params_Filter>>>;
  daySize?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  daySize_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  daySize_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochRewardAmount?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochRewardAmount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochRewardAmount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochSize?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  epochSize_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  epochSize_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Params_Filter>>>;
};

export type Params_OrderBy =
  | "daySize"
  | "epochRewardAmount"
  | "epochSize"
  | "id";

export type PaymentReceived = {
  amount: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  jobId: Scalars["BigInt"]["output"];
  receivedAt: Scalars["BigInt"]["output"];
  receivedAtBlock: Scalars["BigInt"]["output"];
  receivedTxHash: Scalars["Bytes"]["output"];
  refiner: Refiner;
  token: Scalars["Bytes"]["output"];
};

export type PaymentReceived_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  amount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  amount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<PaymentReceived_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  jobId?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  jobId_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  jobId_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<PaymentReceived_Filter>>>;
  receivedAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  receivedAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  receivedAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  receivedAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  receivedAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  receivedTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  receivedTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  receivedTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  refiner?: InputMaybe<Scalars["String"]["input"]>;
  refiner_?: InputMaybe<Refiner_Filter>;
  refiner_contains?: InputMaybe<Scalars["String"]["input"]>;
  refiner_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  refiner_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  refiner_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  refiner_gt?: InputMaybe<Scalars["String"]["input"]>;
  refiner_gte?: InputMaybe<Scalars["String"]["input"]>;
  refiner_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  refiner_lt?: InputMaybe<Scalars["String"]["input"]>;
  refiner_lte?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  refiner_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  refiner_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  refiner_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  refiner_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  token_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  token_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export type PaymentReceived_OrderBy =
  | "amount"
  | "id"
  | "jobId"
  | "receivedAt"
  | "receivedAtBlock"
  | "receivedTxHash"
  | "refiner"
  | "refiner__id"
  | "refiner__name"
  | "refiner__owner"
  | "refiner__refinementInstructionUrl"
  | "refiner__schemaDefinitionUrl"
  | "token";

export type PerformanceDlpEpochUser = {
  id: Scalars["ID"]["output"];
};

export type PerformanceDlpEpochUser_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PerformanceDlpEpochUser_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<PerformanceDlpEpochUser_Filter>>>;
};

export type PerformanceDlpEpochUser_OrderBy = "id";

export type Permission = {
  /** The block number when the permission was granted. */
  addedAtBlock: Scalars["BigInt"]["output"];
  /** The timestamp when the permission was granted. */
  addedAtTimestamp: Scalars["BigInt"]["output"];
  /** The block number when the permission ends (null if no end). */
  endBlock?: Maybe<Scalars["BigInt"]["output"]>;
  /** File permissions for this permission. */
  filePermissions: Array<PermissionFile>;
  /** The content identifier (e.g., IPFS URL) for the grant details. */
  grant: Scalars["String"]["output"];
  /** The grantee who received the permission. */
  grantee: Grantee;
  /** The user who granted the permission. */
  grantor: User;
  /** The unique ID of the permission, equivalent to the on-chain permissionId. */
  id: Scalars["ID"]["output"];
  /** The nonce used for this permission grant. */
  nonce: Scalars["BigInt"]["output"];
  /** The signature provided by the user. */
  signature: Scalars["Bytes"]["output"];
  /** The block number when the permission starts. */
  startBlock: Scalars["BigInt"]["output"];
  /** The transaction hash of the permission grant. */
  transactionHash: Scalars["Bytes"]["output"];
};

export type PermissionFilePermissionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PermissionFile_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PermissionFile_Filter>;
};

export type PermissionFile = {
  /** The file. */
  file: File;
  /** Composite ID: permissionId-fileId */
  id: Scalars["ID"]["output"];
  /** The permission. */
  permission: Permission;
};

export type PermissionFile_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PermissionFile_Filter>>>;
  file?: InputMaybe<Scalars["String"]["input"]>;
  file_?: InputMaybe<File_Filter>;
  file_contains?: InputMaybe<Scalars["String"]["input"]>;
  file_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  file_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  file_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  file_gt?: InputMaybe<Scalars["String"]["input"]>;
  file_gte?: InputMaybe<Scalars["String"]["input"]>;
  file_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  file_lt?: InputMaybe<Scalars["String"]["input"]>;
  file_lte?: InputMaybe<Scalars["String"]["input"]>;
  file_not?: InputMaybe<Scalars["String"]["input"]>;
  file_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  file_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  file_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  file_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  file_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  file_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  file_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  file_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  file_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<PermissionFile_Filter>>>;
  permission?: InputMaybe<Scalars["String"]["input"]>;
  permission_?: InputMaybe<Permission_Filter>;
  permission_contains?: InputMaybe<Scalars["String"]["input"]>;
  permission_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permission_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  permission_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permission_gt?: InputMaybe<Scalars["String"]["input"]>;
  permission_gte?: InputMaybe<Scalars["String"]["input"]>;
  permission_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  permission_lt?: InputMaybe<Scalars["String"]["input"]>;
  permission_lte?: InputMaybe<Scalars["String"]["input"]>;
  permission_not?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  permission_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  permission_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  permission_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  permission_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type PermissionFile_OrderBy =
  | "file"
  | "file__addedAtBlock"
  | "file__addedAtTimestamp"
  | "file__id"
  | "file__schemaId"
  | "file__transactionHash"
  | "file__url"
  | "id"
  | "permission"
  | "permission__addedAtBlock"
  | "permission__addedAtTimestamp"
  | "permission__endBlock"
  | "permission__grant"
  | "permission__id"
  | "permission__nonce"
  | "permission__signature"
  | "permission__startBlock"
  | "permission__transactionHash";

export type Permission_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  addedAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  addedAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  addedAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Permission_Filter>>>;
  endBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  endBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  endBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  filePermissions_?: InputMaybe<PermissionFile_Filter>;
  grant?: InputMaybe<Scalars["String"]["input"]>;
  grant_contains?: InputMaybe<Scalars["String"]["input"]>;
  grant_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grant_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grant_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grant_gt?: InputMaybe<Scalars["String"]["input"]>;
  grant_gte?: InputMaybe<Scalars["String"]["input"]>;
  grant_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grant_lt?: InputMaybe<Scalars["String"]["input"]>;
  grant_lte?: InputMaybe<Scalars["String"]["input"]>;
  grant_not?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grant_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grant_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grant_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grant_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee?: InputMaybe<Scalars["String"]["input"]>;
  grantee_?: InputMaybe<Grantee_Filter>;
  grantee_contains?: InputMaybe<Scalars["String"]["input"]>;
  grantee_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grantee_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee_gt?: InputMaybe<Scalars["String"]["input"]>;
  grantee_gte?: InputMaybe<Scalars["String"]["input"]>;
  grantee_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grantee_lt?: InputMaybe<Scalars["String"]["input"]>;
  grantee_lte?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grantee_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grantee_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantee_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grantee_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor?: InputMaybe<Scalars["String"]["input"]>;
  grantor_?: InputMaybe<User_Filter>;
  grantor_contains?: InputMaybe<Scalars["String"]["input"]>;
  grantor_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grantor_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor_gt?: InputMaybe<Scalars["String"]["input"]>;
  grantor_gte?: InputMaybe<Scalars["String"]["input"]>;
  grantor_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grantor_lt?: InputMaybe<Scalars["String"]["input"]>;
  grantor_lte?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  grantor_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grantor_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  grantor_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  grantor_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  nonce?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  nonce_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  nonce_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Permission_Filter>>>;
  signature?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  signature_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  signature_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  startBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  startBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  startBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
};

export type Permission_OrderBy =
  | "addedAtBlock"
  | "addedAtTimestamp"
  | "endBlock"
  | "filePermissions"
  | "grant"
  | "grantee"
  | "grantee__address"
  | "grantee__id"
  | "grantee__publicKey"
  | "grantee__registeredAtBlock"
  | "grantee__registeredAtTimestamp"
  | "grantee__transactionHash"
  | "grantor"
  | "grantor__id"
  | "id"
  | "nonce"
  | "signature"
  | "startBlock"
  | "transactionHash";

export type Pool = {
  burns: Array<Burn>;
  collectedFeesToken0: Scalars["BigDecimal"]["output"];
  collectedFeesToken1: Scalars["BigDecimal"]["output"];
  collectedFeesUSD: Scalars["BigDecimal"]["output"];
  collects: Array<Collect>;
  createdAtBlockNumber: Scalars["BigInt"]["output"];
  createdAtTimestamp: Scalars["BigInt"]["output"];
  feeTier: Scalars["BigInt"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["Bytes"]["output"];
  liquidity: Scalars["BigInt"]["output"];
  liquidityProviderCount: Scalars["BigInt"]["output"];
  mints: Array<Mint>;
  observationIndex: Scalars["BigInt"]["output"];
  poolDayData: Array<PoolDayData>;
  poolHourData: Array<PoolHourData>;
  sqrtPrice: Scalars["BigInt"]["output"];
  swaps: Array<Swap>;
  tick?: Maybe<Scalars["BigInt"]["output"]>;
  ticks: Array<Tick>;
  token0: Token;
  token0Price: Scalars["BigDecimal"]["output"];
  token1: Token;
  token1Price: Scalars["BigDecimal"]["output"];
  totalValueLockedETH: Scalars["BigDecimal"]["output"];
  totalValueLockedToken0: Scalars["BigDecimal"]["output"];
  totalValueLockedToken1: Scalars["BigDecimal"]["output"];
  totalValueLockedUSD: Scalars["BigDecimal"]["output"];
  totalValueLockedUSDUntracked: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  untrackedVolumeUSD: Scalars["BigDecimal"]["output"];
  volumeToken0: Scalars["BigDecimal"]["output"];
  volumeToken1: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
};

export type PoolBurnsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Burn_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Burn_Filter>;
};

export type PoolCollectsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Collect_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Collect_Filter>;
};

export type PoolMintsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Mint_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Mint_Filter>;
};

export type PoolPoolDayDataArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PoolDayData_Filter>;
};

export type PoolPoolHourDataArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolHourData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PoolHourData_Filter>;
};

export type PoolSwapsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Swap_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Swap_Filter>;
};

export type PoolTicksArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Tick_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Tick_Filter>;
};

export type PoolDayData = {
  close: Scalars["BigDecimal"]["output"];
  date: Scalars["Int"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  high: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  liquidity: Scalars["BigInt"]["output"];
  low: Scalars["BigDecimal"]["output"];
  open: Scalars["BigDecimal"]["output"];
  pool: Pool;
  sqrtPrice: Scalars["BigInt"]["output"];
  tick?: Maybe<Scalars["BigInt"]["output"]>;
  token0Price: Scalars["BigDecimal"]["output"];
  token1Price: Scalars["BigDecimal"]["output"];
  tvlUSD: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  volumeToken0: Scalars["BigDecimal"]["output"];
  volumeToken1: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
};

export type PoolDayData_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PoolDayData_Filter>>>;
  close?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  close_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  date?: InputMaybe<Scalars["Int"]["input"]>;
  date_gt?: InputMaybe<Scalars["Int"]["input"]>;
  date_gte?: InputMaybe<Scalars["Int"]["input"]>;
  date_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  date_lt?: InputMaybe<Scalars["Int"]["input"]>;
  date_lte?: InputMaybe<Scalars["Int"]["input"]>;
  date_not?: InputMaybe<Scalars["Int"]["input"]>;
  date_not_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  liquidity?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidity_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  low?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  low_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<PoolDayData_Filter>>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  sqrtPrice?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  sqrtPrice_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token0Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token0Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tvlUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tvlUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  volumeToken0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type PoolDayData_OrderBy =
  | "close"
  | "date"
  | "feesUSD"
  | "high"
  | "id"
  | "liquidity"
  | "low"
  | "open"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "sqrtPrice"
  | "tick"
  | "token0Price"
  | "token1Price"
  | "tvlUSD"
  | "txCount"
  | "volumeToken0"
  | "volumeToken1"
  | "volumeUSD";

export type PoolHourData = {
  close: Scalars["BigDecimal"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  high: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  liquidity: Scalars["BigInt"]["output"];
  low: Scalars["BigDecimal"]["output"];
  open: Scalars["BigDecimal"]["output"];
  periodStartUnix: Scalars["Int"]["output"];
  pool: Pool;
  sqrtPrice: Scalars["BigInt"]["output"];
  tick?: Maybe<Scalars["BigInt"]["output"]>;
  token0Price: Scalars["BigDecimal"]["output"];
  token1Price: Scalars["BigDecimal"]["output"];
  tvlUSD: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  volumeToken0: Scalars["BigDecimal"]["output"];
  volumeToken1: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
};

export type PoolHourData_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PoolHourData_Filter>>>;
  close?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  close_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  liquidity?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidity_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  low?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  low_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<PoolHourData_Filter>>>;
  periodStartUnix?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_gt?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_gte?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  periodStartUnix_lt?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_lte?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_not?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_not_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  sqrtPrice?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  sqrtPrice_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token0Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token0Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tvlUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tvlUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  volumeToken0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type PoolHourData_OrderBy =
  | "close"
  | "feesUSD"
  | "high"
  | "id"
  | "liquidity"
  | "low"
  | "open"
  | "periodStartUnix"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "sqrtPrice"
  | "tick"
  | "token0Price"
  | "token1Price"
  | "tvlUSD"
  | "txCount"
  | "volumeToken0"
  | "volumeToken1"
  | "volumeUSD";

export type Pool_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Pool_Filter>>>;
  burns_?: InputMaybe<Burn_Filter>;
  collectedFeesToken0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  collectedFeesToken0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken0_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  collectedFeesToken1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  collectedFeesToken1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesToken1_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  collectedFeesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  collectedFeesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  collectedFeesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  collects_?: InputMaybe<Collect_Filter>;
  createdAtBlockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  feeTier?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  feeTier_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  feeTier_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  liquidity?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidityProviderCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityProviderCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidity_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidity_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidity_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  mints_?: InputMaybe<Mint_Filter>;
  observationIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  observationIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  observationIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Pool_Filter>>>;
  poolDayData_?: InputMaybe<PoolDayData_Filter>;
  poolHourData_?: InputMaybe<PoolHourData_Filter>;
  sqrtPrice?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  sqrtPrice_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPrice_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  swaps_?: InputMaybe<Swap_Filter>;
  tick?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  ticks_?: InputMaybe<Tick_Filter>;
  token0?: InputMaybe<Scalars["String"]["input"]>;
  token0Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token0Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token0Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token0_?: InputMaybe<Token_Filter>;
  token0_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_gt?: InputMaybe<Scalars["String"]["input"]>;
  token0_gte?: InputMaybe<Scalars["String"]["input"]>;
  token0_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_lt?: InputMaybe<Scalars["String"]["input"]>;
  token0_lte?: InputMaybe<Scalars["String"]["input"]>;
  token0_not?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1?: InputMaybe<Scalars["String"]["input"]>;
  token1Price?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1Price_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  token1Price_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token1_?: InputMaybe<Token_Filter>;
  token1_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_gt?: InputMaybe<Scalars["String"]["input"]>;
  token1_gte?: InputMaybe<Scalars["String"]["input"]>;
  token1_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_lt?: InputMaybe<Scalars["String"]["input"]>;
  token1_lte?: InputMaybe<Scalars["String"]["input"]>;
  token1_not?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totalValueLockedETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedETH_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedToken0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedToken0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken0_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedToken1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedToken1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedToken1_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSDUntracked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  untrackedVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeToken1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeToken1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type Pool_OrderBy =
  | "burns"
  | "collectedFeesToken0"
  | "collectedFeesToken1"
  | "collectedFeesUSD"
  | "collects"
  | "createdAtBlockNumber"
  | "createdAtTimestamp"
  | "feeTier"
  | "feesUSD"
  | "id"
  | "liquidity"
  | "liquidityProviderCount"
  | "mints"
  | "observationIndex"
  | "poolDayData"
  | "poolHourData"
  | "sqrtPrice"
  | "swaps"
  | "tick"
  | "ticks"
  | "token0"
  | "token0Price"
  | "token0__decimals"
  | "token0__derivedETH"
  | "token0__feesUSD"
  | "token0__id"
  | "token0__name"
  | "token0__poolCount"
  | "token0__symbol"
  | "token0__totalSupply"
  | "token0__totalValueLocked"
  | "token0__totalValueLockedUSD"
  | "token0__totalValueLockedUSDUntracked"
  | "token0__txCount"
  | "token0__untrackedVolumeUSD"
  | "token0__volume"
  | "token0__volumeUSD"
  | "token1"
  | "token1Price"
  | "token1__decimals"
  | "token1__derivedETH"
  | "token1__feesUSD"
  | "token1__id"
  | "token1__name"
  | "token1__poolCount"
  | "token1__symbol"
  | "token1__totalSupply"
  | "token1__totalValueLocked"
  | "token1__totalValueLockedUSD"
  | "token1__totalValueLockedUSDUntracked"
  | "token1__txCount"
  | "token1__untrackedVolumeUSD"
  | "token1__volume"
  | "token1__volumeUSD"
  | "totalValueLockedETH"
  | "totalValueLockedToken0"
  | "totalValueLockedToken1"
  | "totalValueLockedUSD"
  | "totalValueLockedUSDUntracked"
  | "txCount"
  | "untrackedVolumeUSD"
  | "volumeToken0"
  | "volumeToken1"
  | "volumeUSD";

export type Query = {
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  bundle?: Maybe<Bundle>;
  bundles: Array<Bundle>;
  burn?: Maybe<Burn>;
  burns: Array<Burn>;
  collect?: Maybe<Collect>;
  collects: Array<Collect>;
  dataRegistryProof?: Maybe<DataRegistryProof>;
  dataRegistryProofs: Array<DataRegistryProof>;
  dlp?: Maybe<Dlp>;
  dlpList?: Maybe<DlpList>;
  dlpLists: Array<DlpList>;
  dlpPerformance?: Maybe<DlpPerformance>;
  dlpPerformances: Array<DlpPerformance>;
  dlpReward?: Maybe<DlpReward>;
  dlpRewards: Array<DlpReward>;
  dlps: Array<Dlp>;
  epoch?: Maybe<Epoch>;
  epochReference?: Maybe<EpochReference>;
  epochReferences: Array<EpochReference>;
  epoches: Array<Epoch>;
  factories: Array<Factory>;
  factory?: Maybe<Factory>;
  file?: Maybe<File>;
  files: Array<File>;
  flash?: Maybe<Flash>;
  flashes: Array<Flash>;
  grantee?: Maybe<Grantee>;
  grantees: Array<Grantee>;
  mint?: Maybe<Mint>;
  mints: Array<Mint>;
  params?: Maybe<Params>;
  params_collection: Array<Params>;
  paymentReceived?: Maybe<PaymentReceived>;
  paymentReceiveds: Array<PaymentReceived>;
  performanceDlpEpochUser?: Maybe<PerformanceDlpEpochUser>;
  performanceDlpEpochUsers: Array<PerformanceDlpEpochUser>;
  permission?: Maybe<Permission>;
  permissionFile?: Maybe<PermissionFile>;
  permissionFiles: Array<PermissionFile>;
  permissions: Array<Permission>;
  pool?: Maybe<Pool>;
  poolDayData?: Maybe<PoolDayData>;
  poolDayDatas: Array<PoolDayData>;
  poolHourData?: Maybe<PoolHourData>;
  poolHourDatas: Array<PoolHourData>;
  pools: Array<Pool>;
  refiner?: Maybe<Refiner>;
  refiners: Array<Refiner>;
  schema?: Maybe<Schema>;
  schemas: Array<Schema>;
  server?: Maybe<Server>;
  servers: Array<Server>;
  swap?: Maybe<Swap>;
  swaps: Array<Swap>;
  tick?: Maybe<Tick>;
  ticks: Array<Tick>;
  token?: Maybe<Token>;
  tokenDayData?: Maybe<TokenDayData>;
  tokenDayDatas: Array<TokenDayData>;
  tokenHourData?: Maybe<TokenHourData>;
  tokenHourDatas: Array<TokenHourData>;
  tokens: Array<Token>;
  totals?: Maybe<Totals>;
  totals_collection: Array<Totals>;
  transaction?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  uniswapDayData?: Maybe<UniswapDayData>;
  uniswapDayDatas: Array<UniswapDayData>;
  user?: Maybe<User>;
  userServer?: Maybe<UserServer>;
  userServers: Array<UserServer>;
  userTotals?: Maybe<UserTotals>;
  userTotals_collection: Array<UserTotals>;
  users: Array<User>;
};

export type Query_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};

export type QueryBundleArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryBundlesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Bundle_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Bundle_Filter>;
};

export type QueryBurnArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryBurnsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Burn_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Burn_Filter>;
};

export type QueryCollectArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryCollectsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Collect_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Collect_Filter>;
};

export type QueryDataRegistryProofArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryDataRegistryProofsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DataRegistryProof_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DataRegistryProof_Filter>;
};

export type QueryDlpArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryDlpListArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryDlpListsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpList_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpList_Filter>;
};

export type QueryDlpPerformanceArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryDlpPerformancesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpPerformance_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpPerformance_Filter>;
};

export type QueryDlpRewardArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryDlpRewardsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpReward_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpReward_Filter>;
};

export type QueryDlpsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Dlp_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Dlp_Filter>;
};

export type QueryEpochArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryEpochReferenceArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryEpochReferencesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<EpochReference_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<EpochReference_Filter>;
};

export type QueryEpochesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Epoch_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Epoch_Filter>;
};

export type QueryFactoriesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Factory_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Factory_Filter>;
};

export type QueryFactoryArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryFileArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryFilesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<File_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<File_Filter>;
};

export type QueryFlashArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryFlashesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Flash_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Flash_Filter>;
};

export type QueryGranteeArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryGranteesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Grantee_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Grantee_Filter>;
};

export type QueryMintArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryMintsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Mint_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Mint_Filter>;
};

export type QueryParamsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryParams_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Params_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Params_Filter>;
};

export type QueryPaymentReceivedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPaymentReceivedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PaymentReceived_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PaymentReceived_Filter>;
};

export type QueryPerformanceDlpEpochUserArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPerformanceDlpEpochUsersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PerformanceDlpEpochUser_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PerformanceDlpEpochUser_Filter>;
};

export type QueryPermissionArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPermissionFileArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPermissionFilesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PermissionFile_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PermissionFile_Filter>;
};

export type QueryPermissionsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Permission_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Permission_Filter>;
};

export type QueryPoolArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPoolDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPoolDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PoolDayData_Filter>;
};

export type QueryPoolHourDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryPoolHourDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolHourData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PoolHourData_Filter>;
};

export type QueryPoolsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Pool_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Pool_Filter>;
};

export type QueryRefinerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryRefinersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Refiner_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Refiner_Filter>;
};

export type QuerySchemaArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySchemasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Schema_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Schema_Filter>;
};

export type QueryServerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryServersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Server_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Server_Filter>;
};

export type QuerySwapArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QuerySwapsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Swap_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Swap_Filter>;
};

export type QueryTickArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTicksArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Tick_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Tick_Filter>;
};

export type QueryTokenArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTokenDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTokenDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TokenDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<TokenDayData_Filter>;
};

export type QueryTokenHourDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTokenHourDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TokenHourData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<TokenHourData_Filter>;
};

export type QueryTokensArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Token_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Token_Filter>;
};

export type QueryTotalsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTotals_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Totals_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Totals_Filter>;
};

export type QueryTransactionArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryTransactionsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Transaction_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Transaction_Filter>;
};

export type QueryUniswapDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryUniswapDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UniswapDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UniswapDayData_Filter>;
};

export type QueryUserArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryUserServerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryUserServersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserServer_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UserServer_Filter>;
};

export type QueryUserTotalsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type QueryUserTotals_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserTotals_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UserTotals_Filter>;
};

export type QueryUsersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<User_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<User_Filter>;
};

export type Refiner = {
  dlp: Dlp;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  owner: Scalars["Bytes"]["output"];
  payments: Array<PaymentReceived>;
  refinementInstructionUrl: Scalars["String"]["output"];
  schema?: Maybe<Schema>;
  schemaDefinitionUrl: Scalars["String"]["output"];
};

export type RefinerPaymentsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PaymentReceived_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PaymentReceived_Filter>;
};

export type Refiner_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Refiner_Filter>>>;
  dlp?: InputMaybe<Scalars["String"]["input"]>;
  dlp_?: InputMaybe<Dlp_Filter>;
  dlp_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_gte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_lt?: InputMaybe<Scalars["String"]["input"]>;
  dlp_lte?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dlp_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dlp_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  name_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_gt?: InputMaybe<Scalars["String"]["input"]>;
  name_gte?: InputMaybe<Scalars["String"]["input"]>;
  name_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_lt?: InputMaybe<Scalars["String"]["input"]>;
  name_lte?: InputMaybe<Scalars["String"]["input"]>;
  name_not?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  or?: InputMaybe<Array<InputMaybe<Refiner_Filter>>>;
  owner?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  payments_?: InputMaybe<PaymentReceived_Filter>;
  refinementInstructionUrl?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_contains?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_contains_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_ends_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_gt?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_gte?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  refinementInstructionUrl_lt?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_lte?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_not?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_not_contains?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_not_contains_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_not_ends_with?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_not_ends_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_not_in?: InputMaybe<
    Array<Scalars["String"]["input"]>
  >;
  refinementInstructionUrl_not_starts_with?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_not_starts_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  refinementInstructionUrl_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  refinementInstructionUrl_starts_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  schema?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_contains?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_gt?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_gte?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  schemaDefinitionUrl_lt?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_lte?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_not?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_not_contains_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  schemaDefinitionUrl_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_not_ends_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  schemaDefinitionUrl_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  schemaDefinitionUrl_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_not_starts_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  schemaDefinitionUrl_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  schemaDefinitionUrl_starts_with_nocase?: InputMaybe<
    Scalars["String"]["input"]
  >;
  schema_?: InputMaybe<Schema_Filter>;
  schema_contains?: InputMaybe<Scalars["String"]["input"]>;
  schema_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schema_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  schema_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schema_gt?: InputMaybe<Scalars["String"]["input"]>;
  schema_gte?: InputMaybe<Scalars["String"]["input"]>;
  schema_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  schema_lt?: InputMaybe<Scalars["String"]["input"]>;
  schema_lte?: InputMaybe<Scalars["String"]["input"]>;
  schema_not?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  schema_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  schema_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  schema_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  schema_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Refiner_OrderBy =
  | "dlp"
  | "dlp__address"
  | "dlp__createdAt"
  | "dlp__createdAtBlock"
  | "dlp__createdTxHash"
  | "dlp__creator"
  | "dlp__iconUrl"
  | "dlp__id"
  | "dlp__metadata"
  | "dlp__name"
  | "dlp__owner"
  | "dlp__performanceRating"
  | "dlp__status"
  | "dlp__token"
  | "dlp__treasury"
  | "dlp__verificationBlockNumber"
  | "dlp__website"
  | "id"
  | "name"
  | "owner"
  | "payments"
  | "refinementInstructionUrl"
  | "schema"
  | "schemaDefinitionUrl"
  | "schema__createdAt"
  | "schema__createdAtBlock"
  | "schema__createdTxHash"
  | "schema__definitionUrl"
  | "schema__dialect"
  | "schema__id"
  | "schema__name";

export type Schema = {
  createdAt: Scalars["BigInt"]["output"];
  createdAtBlock: Scalars["BigInt"]["output"];
  createdTxHash: Scalars["Bytes"]["output"];
  definitionUrl: Scalars["String"]["output"];
  dialect: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  refiners: Array<Refiner>;
};

export type SchemaRefinersArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Refiner_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Refiner_Filter>;
};

export type Schema_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Schema_Filter>>>;
  createdAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdTxHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  createdTxHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  createdTxHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  definitionUrl?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_contains?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_gt?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_gte?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  definitionUrl_lt?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_lte?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  definitionUrl_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  definitionUrl_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect?: InputMaybe<Scalars["String"]["input"]>;
  dialect_contains?: InputMaybe<Scalars["String"]["input"]>;
  dialect_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dialect_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect_gt?: InputMaybe<Scalars["String"]["input"]>;
  dialect_gte?: InputMaybe<Scalars["String"]["input"]>;
  dialect_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dialect_lt?: InputMaybe<Scalars["String"]["input"]>;
  dialect_lte?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  dialect_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dialect_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  dialect_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  dialect_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  name_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_gt?: InputMaybe<Scalars["String"]["input"]>;
  name_gte?: InputMaybe<Scalars["String"]["input"]>;
  name_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_lt?: InputMaybe<Scalars["String"]["input"]>;
  name_lte?: InputMaybe<Scalars["String"]["input"]>;
  name_not?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  or?: InputMaybe<Array<InputMaybe<Schema_Filter>>>;
  refiners_?: InputMaybe<Refiner_Filter>;
};

export type Schema_OrderBy =
  | "createdAt"
  | "createdAtBlock"
  | "createdTxHash"
  | "definitionUrl"
  | "dialect"
  | "id"
  | "name"
  | "refiners";

export type Server = {
  /** The unique ID of the server, using serverId. */
  id: Scalars["ID"]["output"];
  /** The owner who registered this server. */
  owner: User;
  /** The public key of the server. */
  publicKey: Scalars["Bytes"]["output"];
  /** The block number when the server was registered. */
  registeredAtBlock: Scalars["BigInt"]["output"];
  /** The timestamp when the server was registered. */
  registeredAtTimestamp: Scalars["BigInt"]["output"];
  /** The server's address. */
  serverAddress: Scalars["Bytes"]["output"];
  /** The transaction hash of the server registration. */
  transactionHash: Scalars["Bytes"]["output"];
  /** The URL of the server. */
  url: Scalars["String"]["output"];
  /** User trust relationships for this server. */
  userTrusts: Array<UserServer>;
};

export type ServerUserTrustsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserServer_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserServer_Filter>;
};

export type Server_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Server_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Server_Filter>>>;
  owner?: InputMaybe<Scalars["String"]["input"]>;
  owner_?: InputMaybe<User_Filter>;
  owner_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_gt?: InputMaybe<Scalars["String"]["input"]>;
  owner_gte?: InputMaybe<Scalars["String"]["input"]>;
  owner_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_lt?: InputMaybe<Scalars["String"]["input"]>;
  owner_lte?: InputMaybe<Scalars["String"]["input"]>;
  owner_not?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  owner_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  owner_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  publicKey?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  publicKey_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  publicKey_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  registeredAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  registeredAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  registeredAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  serverAddress?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  serverAddress_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  serverAddress_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  url?: InputMaybe<Scalars["String"]["input"]>;
  url_contains?: InputMaybe<Scalars["String"]["input"]>;
  url_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  url_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_gt?: InputMaybe<Scalars["String"]["input"]>;
  url_gte?: InputMaybe<Scalars["String"]["input"]>;
  url_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  url_lt?: InputMaybe<Scalars["String"]["input"]>;
  url_lte?: InputMaybe<Scalars["String"]["input"]>;
  url_not?: InputMaybe<Scalars["String"]["input"]>;
  url_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  url_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  url_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  url_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  url_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  url_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  url_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  userTrusts_?: InputMaybe<UserServer_Filter>;
};

export type Server_OrderBy =
  | "id"
  | "owner"
  | "owner__id"
  | "publicKey"
  | "registeredAtBlock"
  | "registeredAtTimestamp"
  | "serverAddress"
  | "transactionHash"
  | "url"
  | "userTrusts";

export type Subscription = {
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  bundle?: Maybe<Bundle>;
  bundles: Array<Bundle>;
  burn?: Maybe<Burn>;
  burns: Array<Burn>;
  collect?: Maybe<Collect>;
  collects: Array<Collect>;
  dataRegistryProof?: Maybe<DataRegistryProof>;
  dataRegistryProofs: Array<DataRegistryProof>;
  dlp?: Maybe<Dlp>;
  dlpList?: Maybe<DlpList>;
  dlpLists: Array<DlpList>;
  dlpPerformance?: Maybe<DlpPerformance>;
  dlpPerformances: Array<DlpPerformance>;
  dlpReward?: Maybe<DlpReward>;
  dlpRewards: Array<DlpReward>;
  dlps: Array<Dlp>;
  epoch?: Maybe<Epoch>;
  epochReference?: Maybe<EpochReference>;
  epochReferences: Array<EpochReference>;
  epoches: Array<Epoch>;
  factories: Array<Factory>;
  factory?: Maybe<Factory>;
  file?: Maybe<File>;
  files: Array<File>;
  flash?: Maybe<Flash>;
  flashes: Array<Flash>;
  grantee?: Maybe<Grantee>;
  grantees: Array<Grantee>;
  mint?: Maybe<Mint>;
  mints: Array<Mint>;
  params?: Maybe<Params>;
  params_collection: Array<Params>;
  paymentReceived?: Maybe<PaymentReceived>;
  paymentReceiveds: Array<PaymentReceived>;
  performanceDlpEpochUser?: Maybe<PerformanceDlpEpochUser>;
  performanceDlpEpochUsers: Array<PerformanceDlpEpochUser>;
  permission?: Maybe<Permission>;
  permissionFile?: Maybe<PermissionFile>;
  permissionFiles: Array<PermissionFile>;
  permissions: Array<Permission>;
  pool?: Maybe<Pool>;
  poolDayData?: Maybe<PoolDayData>;
  poolDayDatas: Array<PoolDayData>;
  poolHourData?: Maybe<PoolHourData>;
  poolHourDatas: Array<PoolHourData>;
  pools: Array<Pool>;
  refiner?: Maybe<Refiner>;
  refiners: Array<Refiner>;
  schema?: Maybe<Schema>;
  schemas: Array<Schema>;
  server?: Maybe<Server>;
  servers: Array<Server>;
  swap?: Maybe<Swap>;
  swaps: Array<Swap>;
  tick?: Maybe<Tick>;
  ticks: Array<Tick>;
  token?: Maybe<Token>;
  tokenDayData?: Maybe<TokenDayData>;
  tokenDayDatas: Array<TokenDayData>;
  tokenHourData?: Maybe<TokenHourData>;
  tokenHourDatas: Array<TokenHourData>;
  tokens: Array<Token>;
  totals?: Maybe<Totals>;
  totals_collection: Array<Totals>;
  transaction?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  uniswapDayData?: Maybe<UniswapDayData>;
  uniswapDayDatas: Array<UniswapDayData>;
  user?: Maybe<User>;
  userServer?: Maybe<UserServer>;
  userServers: Array<UserServer>;
  userTotals?: Maybe<UserTotals>;
  userTotals_collection: Array<UserTotals>;
  users: Array<User>;
};

export type Subscription_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};

export type SubscriptionBundleArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionBundlesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Bundle_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Bundle_Filter>;
};

export type SubscriptionBurnArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionBurnsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Burn_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Burn_Filter>;
};

export type SubscriptionCollectArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionCollectsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Collect_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Collect_Filter>;
};

export type SubscriptionDataRegistryProofArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionDataRegistryProofsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DataRegistryProof_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DataRegistryProof_Filter>;
};

export type SubscriptionDlpArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionDlpListArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionDlpListsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpList_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpList_Filter>;
};

export type SubscriptionDlpPerformanceArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionDlpPerformancesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpPerformance_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpPerformance_Filter>;
};

export type SubscriptionDlpRewardArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionDlpRewardsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DlpReward_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<DlpReward_Filter>;
};

export type SubscriptionDlpsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Dlp_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Dlp_Filter>;
};

export type SubscriptionEpochArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionEpochReferenceArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionEpochReferencesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<EpochReference_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<EpochReference_Filter>;
};

export type SubscriptionEpochesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Epoch_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Epoch_Filter>;
};

export type SubscriptionFactoriesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Factory_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Factory_Filter>;
};

export type SubscriptionFactoryArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionFileArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionFilesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<File_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<File_Filter>;
};

export type SubscriptionFlashArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionFlashesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Flash_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Flash_Filter>;
};

export type SubscriptionGranteeArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionGranteesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Grantee_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Grantee_Filter>;
};

export type SubscriptionMintArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionMintsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Mint_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Mint_Filter>;
};

export type SubscriptionParamsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionParams_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Params_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Params_Filter>;
};

export type SubscriptionPaymentReceivedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPaymentReceivedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PaymentReceived_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PaymentReceived_Filter>;
};

export type SubscriptionPerformanceDlpEpochUserArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPerformanceDlpEpochUsersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PerformanceDlpEpochUser_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PerformanceDlpEpochUser_Filter>;
};

export type SubscriptionPermissionArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPermissionFileArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPermissionFilesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PermissionFile_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PermissionFile_Filter>;
};

export type SubscriptionPermissionsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Permission_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Permission_Filter>;
};

export type SubscriptionPoolArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPoolDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPoolDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PoolDayData_Filter>;
};

export type SubscriptionPoolHourDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionPoolHourDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<PoolHourData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<PoolHourData_Filter>;
};

export type SubscriptionPoolsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Pool_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Pool_Filter>;
};

export type SubscriptionRefinerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionRefinersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Refiner_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Refiner_Filter>;
};

export type SubscriptionSchemaArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionSchemasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Schema_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Schema_Filter>;
};

export type SubscriptionServerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionServersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Server_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Server_Filter>;
};

export type SubscriptionSwapArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionSwapsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Swap_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Swap_Filter>;
};

export type SubscriptionTickArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTicksArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Tick_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Tick_Filter>;
};

export type SubscriptionTokenArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTokenDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTokenDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TokenDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<TokenDayData_Filter>;
};

export type SubscriptionTokenHourDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTokenHourDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TokenHourData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<TokenHourData_Filter>;
};

export type SubscriptionTokensArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Token_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Token_Filter>;
};

export type SubscriptionTotalsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTotals_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Totals_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Totals_Filter>;
};

export type SubscriptionTransactionArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionTransactionsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Transaction_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Transaction_Filter>;
};

export type SubscriptionUniswapDayDataArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionUniswapDayDatasArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UniswapDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UniswapDayData_Filter>;
};

export type SubscriptionUserArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionUserServerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionUserServersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserServer_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UserServer_Filter>;
};

export type SubscriptionUserTotalsArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars["ID"]["input"];
  subgraphError?: _SubgraphErrorPolicy_;
};

export type SubscriptionUserTotals_CollectionArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserTotals_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<UserTotals_Filter>;
};

export type SubscriptionUsersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<User_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<User_Filter>;
};

export type Swap = {
  amount0: Scalars["BigDecimal"]["output"];
  amount1: Scalars["BigDecimal"]["output"];
  amountUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  logIndex?: Maybe<Scalars["BigInt"]["output"]>;
  origin: Scalars["Bytes"]["output"];
  pool: Pool;
  recipient: Scalars["Bytes"]["output"];
  sender: Scalars["Bytes"]["output"];
  sqrtPriceX96: Scalars["BigInt"]["output"];
  tick: Scalars["BigInt"]["output"];
  timestamp: Scalars["BigInt"]["output"];
  token0: Token;
  token1: Token;
  transaction: Transaction;
};

export type Swap_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amount1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amount1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  amountUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  amountUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  and?: InputMaybe<Array<InputMaybe<Swap_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  logIndex?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  logIndex_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  logIndex_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Swap_Filter>>>;
  origin?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  origin_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  origin_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  recipient?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  recipient_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  recipient_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sender?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sender_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  sender_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  sqrtPriceX96?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  sqrtPriceX96_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  sqrtPriceX96_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tick_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tick_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  token0?: InputMaybe<Scalars["String"]["input"]>;
  token0_?: InputMaybe<Token_Filter>;
  token0_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_gt?: InputMaybe<Scalars["String"]["input"]>;
  token0_gte?: InputMaybe<Scalars["String"]["input"]>;
  token0_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_lt?: InputMaybe<Scalars["String"]["input"]>;
  token0_lte?: InputMaybe<Scalars["String"]["input"]>;
  token0_not?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token0_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token0_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1?: InputMaybe<Scalars["String"]["input"]>;
  token1_?: InputMaybe<Token_Filter>;
  token1_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_gt?: InputMaybe<Scalars["String"]["input"]>;
  token1_gte?: InputMaybe<Scalars["String"]["input"]>;
  token1_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_lt?: InputMaybe<Scalars["String"]["input"]>;
  token1_lte?: InputMaybe<Scalars["String"]["input"]>;
  token1_not?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token1_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token1_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction?: InputMaybe<Scalars["String"]["input"]>;
  transaction_?: InputMaybe<Transaction_Filter>;
  transaction_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_gte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_lt?: InputMaybe<Scalars["String"]["input"]>;
  transaction_lte?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  transaction_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  transaction_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type Swap_OrderBy =
  | "amount0"
  | "amount1"
  | "amountUSD"
  | "id"
  | "logIndex"
  | "origin"
  | "pool"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "recipient"
  | "sender"
  | "sqrtPriceX96"
  | "tick"
  | "timestamp"
  | "token0"
  | "token0__decimals"
  | "token0__derivedETH"
  | "token0__feesUSD"
  | "token0__id"
  | "token0__name"
  | "token0__poolCount"
  | "token0__symbol"
  | "token0__totalSupply"
  | "token0__totalValueLocked"
  | "token0__totalValueLockedUSD"
  | "token0__totalValueLockedUSDUntracked"
  | "token0__txCount"
  | "token0__untrackedVolumeUSD"
  | "token0__volume"
  | "token0__volumeUSD"
  | "token1"
  | "token1__decimals"
  | "token1__derivedETH"
  | "token1__feesUSD"
  | "token1__id"
  | "token1__name"
  | "token1__poolCount"
  | "token1__symbol"
  | "token1__totalSupply"
  | "token1__totalValueLocked"
  | "token1__totalValueLockedUSD"
  | "token1__totalValueLockedUSDUntracked"
  | "token1__txCount"
  | "token1__untrackedVolumeUSD"
  | "token1__volume"
  | "token1__volumeUSD"
  | "transaction"
  | "transaction__blockNumber"
  | "transaction__gasPrice"
  | "transaction__gasUsed"
  | "transaction__id"
  | "transaction__timestamp";

export type Tick = {
  createdAtBlockNumber: Scalars["BigInt"]["output"];
  createdAtTimestamp: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  liquidityGross: Scalars["BigInt"]["output"];
  liquidityNet: Scalars["BigInt"]["output"];
  pool: Pool;
  poolAddress: Scalars["Bytes"]["output"];
  price0: Scalars["BigDecimal"]["output"];
  price1: Scalars["BigDecimal"]["output"];
  tickIdx: Scalars["BigInt"]["output"];
};

export type Tick_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Tick_Filter>>>;
  createdAtBlockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtBlockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtBlockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtTimestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  createdAtTimestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  createdAtTimestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  liquidityGross?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidityGross_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityGross_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidityNet?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  liquidityNet_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  liquidityNet_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Tick_Filter>>>;
  pool?: InputMaybe<Scalars["String"]["input"]>;
  poolAddress?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  poolAddress_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  poolAddress_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  pool_?: InputMaybe<Pool_Filter>;
  pool_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_gt?: InputMaybe<Scalars["String"]["input"]>;
  pool_gte?: InputMaybe<Scalars["String"]["input"]>;
  pool_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_lt?: InputMaybe<Scalars["String"]["input"]>;
  pool_lte?: InputMaybe<Scalars["String"]["input"]>;
  pool_not?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  pool_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  pool_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  price0?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  price0_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price0_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  price1?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  price1_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  price1_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tickIdx?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  tickIdx_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  tickIdx_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
};

export type Tick_OrderBy =
  | "createdAtBlockNumber"
  | "createdAtTimestamp"
  | "id"
  | "liquidityGross"
  | "liquidityNet"
  | "pool"
  | "poolAddress"
  | "pool__collectedFeesToken0"
  | "pool__collectedFeesToken1"
  | "pool__collectedFeesUSD"
  | "pool__createdAtBlockNumber"
  | "pool__createdAtTimestamp"
  | "pool__feeTier"
  | "pool__feesUSD"
  | "pool__id"
  | "pool__liquidity"
  | "pool__liquidityProviderCount"
  | "pool__observationIndex"
  | "pool__sqrtPrice"
  | "pool__tick"
  | "pool__token0Price"
  | "pool__token1Price"
  | "pool__totalValueLockedETH"
  | "pool__totalValueLockedToken0"
  | "pool__totalValueLockedToken1"
  | "pool__totalValueLockedUSD"
  | "pool__totalValueLockedUSDUntracked"
  | "pool__txCount"
  | "pool__untrackedVolumeUSD"
  | "pool__volumeToken0"
  | "pool__volumeToken1"
  | "pool__volumeUSD"
  | "price0"
  | "price1"
  | "tickIdx";

export type Token = {
  decimals: Scalars["BigInt"]["output"];
  derivedETH: Scalars["BigDecimal"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["Bytes"]["output"];
  name: Scalars["String"]["output"];
  poolCount: Scalars["BigInt"]["output"];
  symbol: Scalars["String"]["output"];
  tokenDayData: Array<TokenDayData>;
  totalSupply: Scalars["BigInt"]["output"];
  totalValueLocked: Scalars["BigDecimal"]["output"];
  totalValueLockedUSD: Scalars["BigDecimal"]["output"];
  totalValueLockedUSDUntracked: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  untrackedVolumeUSD: Scalars["BigDecimal"]["output"];
  volume: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
  whitelistPools: Array<Pool>;
};

export type TokenTokenDayDataArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<TokenDayData_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<TokenDayData_Filter>;
};

export type TokenWhitelistPoolsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Pool_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Pool_Filter>;
};

export type TokenDayData = {
  close: Scalars["BigDecimal"]["output"];
  date: Scalars["Int"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  high: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  low: Scalars["BigDecimal"]["output"];
  open: Scalars["BigDecimal"]["output"];
  priceUSD: Scalars["BigDecimal"]["output"];
  token: Token;
  totalValueLocked: Scalars["BigDecimal"]["output"];
  totalValueLockedUSD: Scalars["BigDecimal"]["output"];
  untrackedVolumeUSD: Scalars["BigDecimal"]["output"];
  volume: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
};

export type TokenDayData_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<TokenDayData_Filter>>>;
  close?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  close_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  date?: InputMaybe<Scalars["Int"]["input"]>;
  date_gt?: InputMaybe<Scalars["Int"]["input"]>;
  date_gte?: InputMaybe<Scalars["Int"]["input"]>;
  date_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  date_lt?: InputMaybe<Scalars["Int"]["input"]>;
  date_lte?: InputMaybe<Scalars["Int"]["input"]>;
  date_not?: InputMaybe<Scalars["Int"]["input"]>;
  date_not_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  low?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  low_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<TokenDayData_Filter>>>;
  priceUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  priceUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token?: InputMaybe<Scalars["String"]["input"]>;
  token_?: InputMaybe<Token_Filter>;
  token_contains?: InputMaybe<Scalars["String"]["input"]>;
  token_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_gt?: InputMaybe<Scalars["String"]["input"]>;
  token_gte?: InputMaybe<Scalars["String"]["input"]>;
  token_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token_lt?: InputMaybe<Scalars["String"]["input"]>;
  token_lte?: InputMaybe<Scalars["String"]["input"]>;
  token_not?: InputMaybe<Scalars["String"]["input"]>;
  token_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totalValueLocked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLocked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLocked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type TokenDayData_OrderBy =
  | "close"
  | "date"
  | "feesUSD"
  | "high"
  | "id"
  | "low"
  | "open"
  | "priceUSD"
  | "token"
  | "token__decimals"
  | "token__derivedETH"
  | "token__feesUSD"
  | "token__id"
  | "token__name"
  | "token__poolCount"
  | "token__symbol"
  | "token__totalSupply"
  | "token__totalValueLocked"
  | "token__totalValueLockedUSD"
  | "token__totalValueLockedUSDUntracked"
  | "token__txCount"
  | "token__untrackedVolumeUSD"
  | "token__volume"
  | "token__volumeUSD"
  | "totalValueLocked"
  | "totalValueLockedUSD"
  | "untrackedVolumeUSD"
  | "volume"
  | "volumeUSD";

export type TokenHourData = {
  close: Scalars["BigDecimal"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  high: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  low: Scalars["BigDecimal"]["output"];
  open: Scalars["BigDecimal"]["output"];
  periodStartUnix: Scalars["Int"]["output"];
  priceUSD: Scalars["BigDecimal"]["output"];
  token: Token;
  totalValueLocked: Scalars["BigDecimal"]["output"];
  totalValueLockedUSD: Scalars["BigDecimal"]["output"];
  untrackedVolumeUSD: Scalars["BigDecimal"]["output"];
  volume: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
};

export type TokenHourData_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<TokenHourData_Filter>>>;
  close?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  close_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  close_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  high_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  high_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  low?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  low_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  low_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  open_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  open_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<TokenHourData_Filter>>>;
  periodStartUnix?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_gt?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_gte?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  periodStartUnix_lt?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_lte?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_not?: InputMaybe<Scalars["Int"]["input"]>;
  periodStartUnix_not_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  priceUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  priceUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  priceUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  token?: InputMaybe<Scalars["String"]["input"]>;
  token_?: InputMaybe<Token_Filter>;
  token_contains?: InputMaybe<Scalars["String"]["input"]>;
  token_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_gt?: InputMaybe<Scalars["String"]["input"]>;
  token_gte?: InputMaybe<Scalars["String"]["input"]>;
  token_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token_lt?: InputMaybe<Scalars["String"]["input"]>;
  token_lte?: InputMaybe<Scalars["String"]["input"]>;
  token_not?: InputMaybe<Scalars["String"]["input"]>;
  token_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  token_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  token_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  token_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  token_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  token_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  totalValueLocked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLocked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLocked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type TokenHourData_OrderBy =
  | "close"
  | "feesUSD"
  | "high"
  | "id"
  | "low"
  | "open"
  | "periodStartUnix"
  | "priceUSD"
  | "token"
  | "token__decimals"
  | "token__derivedETH"
  | "token__feesUSD"
  | "token__id"
  | "token__name"
  | "token__poolCount"
  | "token__symbol"
  | "token__totalSupply"
  | "token__totalValueLocked"
  | "token__totalValueLockedUSD"
  | "token__totalValueLockedUSDUntracked"
  | "token__txCount"
  | "token__untrackedVolumeUSD"
  | "token__volume"
  | "token__volumeUSD"
  | "totalValueLocked"
  | "totalValueLockedUSD"
  | "untrackedVolumeUSD"
  | "volume"
  | "volumeUSD";

export type Token_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Token_Filter>>>;
  decimals?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  decimals_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  decimals_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  derivedETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  derivedETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  derivedETH_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  id_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  name_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_gt?: InputMaybe<Scalars["String"]["input"]>;
  name_gte?: InputMaybe<Scalars["String"]["input"]>;
  name_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_lt?: InputMaybe<Scalars["String"]["input"]>;
  name_lte?: InputMaybe<Scalars["String"]["input"]>;
  name_not?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  name_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  name_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  name_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  or?: InputMaybe<Array<InputMaybe<Token_Filter>>>;
  poolCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  poolCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  poolCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  symbol?: InputMaybe<Scalars["String"]["input"]>;
  symbol_contains?: InputMaybe<Scalars["String"]["input"]>;
  symbol_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  symbol_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  symbol_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  symbol_gt?: InputMaybe<Scalars["String"]["input"]>;
  symbol_gte?: InputMaybe<Scalars["String"]["input"]>;
  symbol_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  symbol_lt?: InputMaybe<Scalars["String"]["input"]>;
  symbol_lte?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  symbol_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  symbol_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  symbol_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  symbol_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  tokenDayData_?: InputMaybe<TokenDayData_Filter>;
  totalSupply?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  totalSupply_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalSupply_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  totalValueLocked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSDUntracked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSDUntracked_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLockedUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLockedUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLockedUSD_not_in?: InputMaybe<
    Array<Scalars["BigDecimal"]["input"]>
  >;
  totalValueLocked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  totalValueLocked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  totalValueLocked_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  untrackedVolumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volume_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volume_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  whitelistPools?: InputMaybe<Array<Scalars["String"]["input"]>>;
  whitelistPools_?: InputMaybe<Pool_Filter>;
  whitelistPools_contains?: InputMaybe<Array<Scalars["String"]["input"]>>;
  whitelistPools_contains_nocase?: InputMaybe<
    Array<Scalars["String"]["input"]>
  >;
  whitelistPools_not?: InputMaybe<Array<Scalars["String"]["input"]>>;
  whitelistPools_not_contains?: InputMaybe<Array<Scalars["String"]["input"]>>;
  whitelistPools_not_contains_nocase?: InputMaybe<
    Array<Scalars["String"]["input"]>
  >;
};

export type Token_OrderBy =
  | "decimals"
  | "derivedETH"
  | "feesUSD"
  | "id"
  | "name"
  | "poolCount"
  | "symbol"
  | "tokenDayData"
  | "totalSupply"
  | "totalValueLocked"
  | "totalValueLockedUSD"
  | "totalValueLockedUSDUntracked"
  | "txCount"
  | "untrackedVolumeUSD"
  | "volume"
  | "volumeUSD"
  | "whitelistPools";

export type Totals = {
  dataAccessFees: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  totalFileContributions: Scalars["BigInt"]["output"];
  uniqueFileContributors: Scalars["BigInt"]["output"];
};

export type Totals_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Totals_Filter>>>;
  dataAccessFees?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  dataAccessFees_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  dataAccessFees_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<Totals_Filter>>>;
  totalFileContributions?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  totalFileContributions_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  totalFileContributions_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  uniqueFileContributors?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  uniqueFileContributors_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  uniqueFileContributors_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
};

export type Totals_OrderBy =
  | "dataAccessFees"
  | "id"
  | "totalFileContributions"
  | "uniqueFileContributors";

export type Transaction = {
  blockNumber: Scalars["BigInt"]["output"];
  burns: Array<Maybe<Burn>>;
  collects: Array<Maybe<Collect>>;
  flashed: Array<Maybe<Flash>>;
  gasPrice: Scalars["BigInt"]["output"];
  gasUsed: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
  mints: Array<Maybe<Mint>>;
  swaps: Array<Maybe<Swap>>;
  timestamp: Scalars["BigInt"]["output"];
};

export type TransactionBurnsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Burn_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Burn_Filter>;
};

export type TransactionCollectsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Collect_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Collect_Filter>;
};

export type TransactionFlashedArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Flash_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Flash_Filter>;
};

export type TransactionMintsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Mint_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Mint_Filter>;
};

export type TransactionSwapsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Swap_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Swap_Filter>;
};

export type Transaction_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Transaction_Filter>>>;
  blockNumber?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  blockNumber_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  blockNumber_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  burns_?: InputMaybe<Burn_Filter>;
  collects_?: InputMaybe<Collect_Filter>;
  flashed_?: InputMaybe<Flash_Filter>;
  gasPrice?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  gasPrice_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasPrice_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  gasUsed?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  gasUsed_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  gasUsed_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  mints_?: InputMaybe<Mint_Filter>;
  or?: InputMaybe<Array<InputMaybe<Transaction_Filter>>>;
  swaps_?: InputMaybe<Swap_Filter>;
  timestamp?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  timestamp_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  timestamp_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
};

export type Transaction_OrderBy =
  | "blockNumber"
  | "burns"
  | "collects"
  | "flashed"
  | "gasPrice"
  | "gasUsed"
  | "id"
  | "mints"
  | "swaps"
  | "timestamp";

export type UniswapDayData = {
  date: Scalars["Int"]["output"];
  feesUSD: Scalars["BigDecimal"]["output"];
  id: Scalars["ID"]["output"];
  tvlUSD: Scalars["BigDecimal"]["output"];
  txCount: Scalars["BigInt"]["output"];
  volumeETH: Scalars["BigDecimal"]["output"];
  volumeUSD: Scalars["BigDecimal"]["output"];
  volumeUSDUntracked: Scalars["BigDecimal"]["output"];
};

export type UniswapDayData_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<UniswapDayData_Filter>>>;
  date?: InputMaybe<Scalars["Int"]["input"]>;
  date_gt?: InputMaybe<Scalars["Int"]["input"]>;
  date_gte?: InputMaybe<Scalars["Int"]["input"]>;
  date_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  date_lt?: InputMaybe<Scalars["Int"]["input"]>;
  date_lte?: InputMaybe<Scalars["Int"]["input"]>;
  date_not?: InputMaybe<Scalars["Int"]["input"]>;
  date_not_in?: InputMaybe<Array<Scalars["Int"]["input"]>>;
  feesUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  feesUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  feesUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<UniswapDayData_Filter>>>;
  tvlUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  tvlUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  txCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  txCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  txCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  volumeETH?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeETH_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeETH_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSDUntracked_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSDUntracked_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_gt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_gte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
  volumeUSD_lt?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_lte?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not?: InputMaybe<Scalars["BigDecimal"]["input"]>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars["BigDecimal"]["input"]>>;
};

export type UniswapDayData_OrderBy =
  | "date"
  | "feesUSD"
  | "id"
  | "tvlUSD"
  | "txCount"
  | "volumeETH"
  | "volumeUSD"
  | "volumeUSDUntracked";

export type User = {
  fileContributions?: Maybe<Array<DataRegistryProof>>;
  /** All files owned by this user */
  files: Array<File>;
  id: Scalars["ID"]["output"];
  /** All permissions granted by this user */
  permissions: Array<Permission>;
  /** All server trust relationships for this user */
  serverTrusts: Array<UserServer>;
};

export type UserFileContributionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<DataRegistryProof_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<DataRegistryProof_Filter>;
};

export type UserFilesArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<File_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<File_Filter>;
};

export type UserPermissionsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<Permission_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<Permission_Filter>;
};

export type UserServerTrustsArgs = {
  first?: InputMaybe<Scalars["Int"]["input"]>;
  orderBy?: InputMaybe<UserServer_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserServer_Filter>;
};

export type UserServer = {
  /** Composite ID: userId-serverId */
  id: Scalars["ID"]["output"];
  /** The server that is trusted. */
  server: Server;
  /** The transaction hash of the trust establishment. */
  transactionHash: Scalars["Bytes"]["output"];
  /** Timestamp of when the trust was established. */
  trustedAt: Scalars["BigInt"]["output"];
  /** Block number when the trust was established. */
  trustedAtBlock: Scalars["BigInt"]["output"];
  /** Block number when the trust was revoked (null if still trusted). */
  untrustedAtBlock?: Maybe<Scalars["BigInt"]["output"]>;
  /** The user who trusts the server. */
  user: User;
};

export type UserServer_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<UserServer_Filter>>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<UserServer_Filter>>>;
  server?: InputMaybe<Scalars["String"]["input"]>;
  server_?: InputMaybe<Server_Filter>;
  server_contains?: InputMaybe<Scalars["String"]["input"]>;
  server_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  server_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  server_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  server_gt?: InputMaybe<Scalars["String"]["input"]>;
  server_gte?: InputMaybe<Scalars["String"]["input"]>;
  server_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  server_lt?: InputMaybe<Scalars["String"]["input"]>;
  server_lte?: InputMaybe<Scalars["String"]["input"]>;
  server_not?: InputMaybe<Scalars["String"]["input"]>;
  server_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  server_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  server_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  server_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  server_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  server_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  server_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  server_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  server_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  transactionHash?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_gte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  transactionHash_lt?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_lte?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_contains?: InputMaybe<Scalars["Bytes"]["input"]>;
  transactionHash_not_in?: InputMaybe<Array<Scalars["Bytes"]["input"]>>;
  trustedAt?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  trustedAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  trustedAt_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAt_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAt_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  trustedAt_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAt_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAt_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  trustedAt_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  untrustedAtBlock?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  untrustedAtBlock_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  untrustedAtBlock_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  user?: InputMaybe<Scalars["String"]["input"]>;
  user_?: InputMaybe<User_Filter>;
  user_contains?: InputMaybe<Scalars["String"]["input"]>;
  user_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  user_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_gt?: InputMaybe<Scalars["String"]["input"]>;
  user_gte?: InputMaybe<Scalars["String"]["input"]>;
  user_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  user_lt?: InputMaybe<Scalars["String"]["input"]>;
  user_lte?: InputMaybe<Scalars["String"]["input"]>;
  user_not?: InputMaybe<Scalars["String"]["input"]>;
  user_not_contains?: InputMaybe<Scalars["String"]["input"]>;
  user_not_contains_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_not_ends_with?: InputMaybe<Scalars["String"]["input"]>;
  user_not_ends_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_not_in?: InputMaybe<Array<Scalars["String"]["input"]>>;
  user_not_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  user_not_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
  user_starts_with?: InputMaybe<Scalars["String"]["input"]>;
  user_starts_with_nocase?: InputMaybe<Scalars["String"]["input"]>;
};

export type UserServer_OrderBy =
  | "id"
  | "server"
  | "server__id"
  | "server__publicKey"
  | "server__registeredAtBlock"
  | "server__registeredAtTimestamp"
  | "server__serverAddress"
  | "server__transactionHash"
  | "server__url"
  | "transactionHash"
  | "trustedAt"
  | "trustedAtBlock"
  | "untrustedAtBlock"
  | "user"
  | "user__id";

export type UserTotals = {
  fileContributionsCount: Scalars["BigInt"]["output"];
  id: Scalars["ID"]["output"];
};

export type UserTotals_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<UserTotals_Filter>>>;
  fileContributionsCount?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_gt?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_gte?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  fileContributionsCount_lt?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_lte?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_not?: InputMaybe<Scalars["BigInt"]["input"]>;
  fileContributionsCount_not_in?: InputMaybe<Array<Scalars["BigInt"]["input"]>>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<UserTotals_Filter>>>;
};

export type UserTotals_OrderBy = "fileContributionsCount" | "id";

export type User_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<User_Filter>>>;
  fileContributions_?: InputMaybe<DataRegistryProof_Filter>;
  files_?: InputMaybe<File_Filter>;
  id?: InputMaybe<Scalars["ID"]["input"]>;
  id_gt?: InputMaybe<Scalars["ID"]["input"]>;
  id_gte?: InputMaybe<Scalars["ID"]["input"]>;
  id_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  id_lt?: InputMaybe<Scalars["ID"]["input"]>;
  id_lte?: InputMaybe<Scalars["ID"]["input"]>;
  id_not?: InputMaybe<Scalars["ID"]["input"]>;
  id_not_in?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  or?: InputMaybe<Array<InputMaybe<User_Filter>>>;
  permissions_?: InputMaybe<Permission_Filter>;
  serverTrusts_?: InputMaybe<UserServer_Filter>;
};

export type User_OrderBy =
  | "fileContributions"
  | "files"
  | "id"
  | "permissions"
  | "serverTrusts";

export type _Block_ = {
  /** The hash of the block */
  hash?: Maybe<Scalars["Bytes"]["output"]>;
  /** The block number */
  number: Scalars["Int"]["output"];
  /** The hash of the parent block */
  parentHash?: Maybe<Scalars["Bytes"]["output"]>;
  /** Integer representation of the timestamp stored in blocks for the chain */
  timestamp?: Maybe<Scalars["Int"]["output"]>;
};

/** The type for the top-level _meta field */
export type _Meta_ = {
  /**
   * Information about a specific subgraph block. The hash of the block
   * will be null if the _meta field has a block constraint that asks for
   * a block number. It will be filled if the _meta field has no block constraint
   * and therefore asks for the latest  block
   *
   */
  block: _Block_;
  /** The deployment ID */
  deployment: Scalars["String"]["output"];
  /** If `true`, the subgraph encountered indexing errors at some past block */
  hasIndexingErrors: Scalars["Boolean"]["output"];
};

export type _SubgraphErrorPolicy_ =
  /** Data will be returned even if the subgraph has indexing errors */
  | "allow"
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  | "deny";

export type GetUserPermissionsQueryVariables = Exact<{
  userId: Scalars["ID"]["input"];
}>;

export type GetUserPermissionsQuery = {
  user?: {
    id: string;
    permissions: Array<{
      id: string;
      grant: string;
      nonce: string;
      signature: string;
      startBlock: string;
      endBlock?: string | null;
      addedAtBlock: string;
      filePermissions: Array<{ file: { id: string; url: string } }>;
    }>;
  } | null;
};

export type GetUserTrustedServersQueryVariables = Exact<{
  userId: Scalars["ID"]["input"];
}>;

export type GetUserTrustedServersQuery = {
  user?: {
    id: string;
    serverTrusts: Array<{
      id: string;
      trustedAt: string;
      trustedAtBlock: string;
      untrustedAtBlock?: string | null;
      transactionHash: string;
      server: {
        id: string;
        serverAddress: string;
        url: string;
        publicKey: string;
      };
    }>;
  } | null;
};

export type GetSchemaQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type GetSchemaQuery = {
  schema?: {
    id: string;
    name: string;
    dialect: string;
    definitionUrl: string;
    createdAt: string;
    createdAtBlock: string;
    createdTxHash: string;
    refiners: Array<{ id: string; name: string; owner: string }>;
  } | null;
};

export type ListSchemasQueryVariables = Exact<{
  first: Scalars["Int"]["input"];
  skip: Scalars["Int"]["input"];
}>;

export type ListSchemasQuery = {
  schemas: Array<{
    id: string;
    name: string;
    dialect: string;
    definitionUrl: string;
    createdAt: string;
    createdAtBlock: string;
    createdTxHash: string;
  }>;
};

export type CountSchemasQueryVariables = Exact<{ [key: string]: never }>;

export type CountSchemasQuery = { schemas: Array<{ id: string }> };

export const GetUserPermissionsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetUserPermissions" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "userId" },
          },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "user" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "userId" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "permissions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "grant" } },
                      { kind: "Field", name: { kind: "Name", value: "nonce" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "signature" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "startBlock" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "endBlock" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "addedAtBlock" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "filePermissions" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "file" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "id" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "url" },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetUserPermissionsQuery,
  GetUserPermissionsQueryVariables
>;
export const GetUserTrustedServersDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetUserTrustedServers" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "userId" },
          },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "user" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "userId" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "serverTrusts" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "server" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "id" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "serverAddress" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "url" },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "publicKey" },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "trustedAt" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "trustedAtBlock" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "untrustedAtBlock" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "transactionHash" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetUserTrustedServersQuery,
  GetUserTrustedServersQueryVariables
>;
export const GetSchemaDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetSchema" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "schema" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "id" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "dialect" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "definitionUrl" },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdAtBlock" },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdTxHash" },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "refiners" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "owner" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSchemaQuery, GetSchemaQueryVariables>;
export const ListSchemasDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ListSchemas" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "first" },
          },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "skip" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "schemas" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "first" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "skip" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "skip" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderBy" },
                value: { kind: "EnumValue", value: "createdAt" },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "orderDirection" },
                value: { kind: "EnumValue", value: "desc" },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "dialect" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "definitionUrl" },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdAtBlock" },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdTxHash" },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ListSchemasQuery, ListSchemasQueryVariables>;
export const CountSchemasDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "CountSchemas" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "schemas" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "first" },
                value: { kind: "IntValue", value: "1000" },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CountSchemasQuery, CountSchemasQueryVariables>;
