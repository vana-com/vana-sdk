import type { Address, Hash } from "viem";

/**
 * Generic request pattern for all SDK operations
 *
 * @category Reference
 */
export interface GenericRequest<TParams = unknown, TOptions = unknown> {
  /** Request parameters */
  params: TParams;
  /** Additional request options */
  options?: TOptions;
}

/**
 * Generic response pattern for all SDK operations
 *
 * @category Reference
 */
export interface GenericResponse<TData = unknown, TMeta = unknown> {
  /** Response data */
  data: TData;
  /** Response metadata */
  meta?: TMeta;
  /** Success status */
  success: boolean;
  /** Error information if not successful */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Generic async operation result
 *
 * @category Reference
 */
export interface AsyncResult<T> {
  /** Operation result */
  result: T;
  /** Transaction hash if applicable */
  transactionHash?: Hash;
  /** Block number if applicable */
  blockNumber?: bigint;
  /** Gas used if applicable */
  gasUsed?: bigint;
}

/**
 * Generic contract interaction parameters
 *
 * @category Reference
 */
export interface ContractCall<
  TArgs extends readonly unknown[] = readonly unknown[],
> {
  /** Contract method name */
  method: string;
  /** Method arguments */
  args: TArgs;
  /** Call options */
  options?: {
    /** Gas limit */
    gasLimit?: bigint;
    /** Gas price */
    gasPrice?: bigint;
    /** Value to send */
    value?: bigint;
  };
}

/**
 * Generic contract event filter
 *
 * @category Reference
 */
export interface EventFilter<TEventArgs = unknown> {
  /** Event name */
  event: string;
  /** Event arguments filter */
  args?: TEventArgs;
  /** From block */
  fromBlock?: bigint;
  /** To block */
  toBlock?: bigint;
  /** Address filter */
  address?: Address | Address[];
}

/**
 * Generic event log
 *
 * @category Reference
 */
export interface EventLog<TArgs = unknown> {
  /** Event name */
  event: string;
  /** Event arguments */
  args: TArgs;
  /** Block number */
  blockNumber: bigint;
  /** Transaction hash */
  transactionHash: Hash;
  /** Log index */
  logIndex: number;
  /** Transaction index */
  transactionIndex: number;
  /** Contract address */
  address: Address;
}

/**
 * Generic controller context for dependency injection
 *
 * @category Reference
 */
export interface ControllerContext<TClient = unknown, TConfig = unknown> {
  /** Client instance */
  client: TClient;
  /** Configuration */
  config?: TConfig;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Generic controller interface
 *
 * @category Reference
 */
export interface Controller<TContext = unknown> {
  /** Controller context */
  readonly context: TContext;
}

/**
 * Generic storage provider interface
 *
 * @category Reference
 */
export interface StorageProvider<TConfig = unknown, TOptions = unknown> {
  /** Provider name */
  readonly name: string;
  /** Provider configuration */
  readonly config: TConfig;

  /** Upload data */
  upload(
    data: Uint8Array,
    options?: TOptions,
  ): Promise<{
    url: string;
    size: number;
    checksum?: string;
  }>;

  /** Download data */
  download(
    url: string,
    options?: TOptions,
  ): Promise<{
    data: Uint8Array;
    size: number;
    checksum?: string;
  }>;

  /** Delete data */
  delete?(url: string, options?: TOptions): Promise<boolean>;

  /** Check if data exists */
  exists?(url: string, options?: TOptions): Promise<boolean>;
}

/**
 * Generic cache interface
 *
 * @category Reference
 */
export interface Cache<TKey = string, TValue = unknown> {
  /** Get value from cache */
  get(key: TKey): Promise<TValue | undefined>;

  /** Set value in cache */
  set(key: TKey, value: TValue, ttl?: number): Promise<void>;

  /** Delete value from cache */
  delete(key: TKey): Promise<boolean>;

  /** Clear all cache */
  clear(): Promise<void>;

  /** Check if key exists */
  has(key: TKey): Promise<boolean>;
}

/**
 * Generic retry configuration
 *
 * @category Reference
 */
export interface RetryConfig<TError = Error> {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum delay */
  maxDelay?: number;
  /** Jitter factor */
  jitter?: number;
  /** Retry condition */
  shouldRetry?: (error: TError, attempt: number) => boolean;
}

/**
 * Generic rate limiter configuration
 *
 * @category Reference
 */
export interface RateLimiterConfig {
  /** Requests per time window */
  requestsPerWindow: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Burst allowance */
  burstLimit?: number;
}

/**
 * Generic middleware interface
 *
 * @category Reference
 */
export interface Middleware<TRequest = unknown, TResponse = unknown> {
  /** Middleware name */
  readonly name: string;

  /** Process request */
  request?(req: TRequest): Promise<TRequest>;

  /** Process response */
  response?(res: TResponse): Promise<TResponse>;

  /** Handle errors */
  error?(error: Error, req: TRequest): Promise<TResponse | void>;
}

/**
 * Generic plugin interface
 *
 * @category Reference
 */
export interface Plugin<TConfig = unknown> {
  /** Plugin name */
  readonly name: string;
  /** Plugin version */
  readonly version: string;
  /** Plugin configuration */
  readonly config: TConfig;

  /** Initialize plugin */
  init?(): Promise<void>;

  /** Cleanup plugin */
  cleanup?(): Promise<void>;
}

/**
 * Generic factory interface
 *
 * @category Reference
 */
export interface Factory<T, TParams = unknown> {
  /** Create instance */
  create(params: TParams): T;

  /** Create multiple instances */
  createMany?(params: TParams[]): T[];

  /** Validate parameters */
  validate?(params: TParams): boolean;
}

/**
 * Generic repository interface for data access
 *
 * @category Reference
 */
export interface Repository<TEntity, TKey = string | number> {
  /** Find by ID */
  findById(id: TKey): Promise<TEntity | undefined>;

  /** Find all entities */
  findAll(options?: {
    limit?: number;
    offset?: number;
    filter?: Partial<TEntity>;
    sort?: Array<{ field: keyof TEntity; direction: "asc" | "desc" }>;
  }): Promise<{
    entities: TEntity[];
    total: number;
    hasMore: boolean;
  }>;

  /** Create entity */
  create(entity: Omit<TEntity, "id">): Promise<TEntity>;

  /** Update entity */
  update(id: TKey, updates: Partial<TEntity>): Promise<TEntity>;

  /** Delete entity */
  delete(id: TKey): Promise<boolean>;

  /** Check if entity exists */
  exists(id: TKey): Promise<boolean>;
}

/**
 * Generic validator interface
 *
 * @category Reference
 */
export interface Validator<T> {
  /** Validate value */
  validate(value: unknown): value is T;

  /** Get validation errors */
  getErrors?(value: unknown): string[];

  /** Get validation schema */
  getSchema?(): unknown;
}

/**
 * Generic transformer interface
 *
 * @category Reference
 */
export interface Transformer<TInput, TOutput> {
  /** Transform input to output */
  transform(input: TInput): TOutput | Promise<TOutput>;

  /** Reverse transform output to input */
  reverse?(output: TOutput): TInput | Promise<TInput>;
}

/**
 * Generic service interface
 *
 * @category Reference
 */
export interface Service<TConfig = unknown> {
  /** Service name */
  readonly name: string;
  /** Service configuration */
  readonly config: TConfig;
  /** Service status */
  readonly status:
    | "idle"
    | "starting"
    | "running"
    | "stopping"
    | "stopped"
    | "error";

  /** Start service */
  start(): Promise<void>;

  /** Stop service */
  stop(): Promise<void>;

  /** Restart service */
  restart?(): Promise<void>;

  /** Get health status */
  getHealth?(): Promise<{
    healthy: boolean;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Generic observer pattern
 *
 * @category Reference
 */
export interface Observer<TEvent = unknown> {
  /** Handle event */
  notify(event: TEvent): void | Promise<void>;
}

/**
 * Generic observable pattern
 *
 * @category Reference
 */
export interface Observable<TEvent = unknown> {
  /** Subscribe to events */
  subscribe(observer: Observer<TEvent>): () => void;

  /** Unsubscribe from events */
  unsubscribe(observer: Observer<TEvent>): void;

  /** Emit event */
  emit(event: TEvent): void;
}

/**
 * Generic state machine interface
 *
 * @category Reference
 */
export interface StateMachine<TState, TEvent> {
  /** Current state */
  readonly currentState: TState;

  /** Transition to new state */
  transition(event: TEvent): TState;

  /** Check if transition is valid */
  canTransition(event: TEvent): boolean;

  /** Get available transitions */
  getAvailableTransitions(): TEvent[];
}

/**
 * Helper type to make properties optional conditionally
 *
 * @category Reference
 */
export type ConditionalOptional<
  T,
  K extends keyof T,
  Condition extends boolean,
> = Condition extends true ? Omit<T, K> & Partial<Pick<T, K>> : T;

/**
 * Helper type to extract promise result type
 *
 * @category Reference
 */
export type PromiseResult<T> = T extends Promise<infer U> ? U : T;

/**
 * Helper type to create a union of all possible keys
 *
 * @category Reference
 */
export type AllKeys<T> = T extends unknown ? keyof T : never;

/**
 * Helper type to create a deep partial type
 *
 * @category Reference
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Helper type to create a deep readonly type
 *
 * @category Reference
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Helper type to create a required type with specific keys
 *
 * @category Reference
 */
export type RequireKeys<T, K extends keyof T> = Required<Pick<T, K>> &
  Omit<T, K>;

/**
 * Helper type to create an optional type with specific keys
 *
 * @category Reference
 */
export type OptionalKeys<T, K extends keyof T> = Partial<Pick<T, K>> &
  Omit<T, K>;

/**
 * Helper type to exclude null and undefined
 *
 * @category Reference
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Helper type to create a type with only specific keys
 *
 * @category Reference
 */
export type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

/**
 * Helper type to omit keys by type
 *
 * @category Reference
 */
export type OmitByType<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K];
};

/**
 * Helper type for branded types
 *
 * @category Reference
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * Helper type for nominal types
 *
 * @category Reference
 */
export type Nominal<T, N extends string> = T & { readonly __nominal: N };
