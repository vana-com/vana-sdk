import { describe, it, expect } from "vitest";
import type { Address, Hash } from "viem";
import type {
  GenericRequest,
  GenericResponse,
  AsyncResult,
  ContractCall,
  EventFilter,
  EventLog,
  ControllerContext,
  Controller,
  StorageProvider,
  Cache,
  RetryConfig,
  RateLimiterConfig,
  Middleware,
  Plugin,
  Factory,
  Repository,
  Validator,
  Transformer,
  Service,
  Observer,
  Observable,
  StateMachine,
  ConditionalOptional,
  PromiseResult,
  DeepPartial,
  DeepReadonly,
  RequireKeys,
  PickByType,
  OmitByType,
  Brand,
  Nominal,
} from "../types/generics";

describe("Generic Types", () => {
  describe("Request/Response Patterns", () => {
    it("should structure generic request correctly", () => {
      const request: GenericRequest<{ id: number }, { timeout: number }> = {
        params: { id: 123 },
        options: { timeout: 5000 },
      };

      expect(request.params.id).toBe(123);
      expect(request.options?.timeout).toBe(5000);
    });

    it("should handle request without options", () => {
      const request: GenericRequest<{ name: string }> = {
        params: { name: "test" },
      };

      expect(request.params.name).toBe("test");
      expect(request.options).toBeUndefined();
    });

    it("should structure generic response correctly", () => {
      const successResponse: GenericResponse<
        { result: string },
        { version: string }
      > = {
        data: { result: "success" },
        meta: { version: "1.0.0" },
        success: true,
      };

      const errorResponse: GenericResponse<never, never> = {
        data: null as never,
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input provided",
          details: { field: "email", reason: "invalid format" },
        },
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data.result).toBe("success");
      expect(successResponse.meta?.version).toBe("1.0.0");
      expect(successResponse.error).toBeUndefined();

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error?.code).toBe("VALIDATION_ERROR");
      expect((errorResponse.error?.details as any)?.field).toBe("email");
    });

    it("should structure async result correctly", () => {
      const result: AsyncResult<{ fileId: number }> = {
        result: { fileId: 456 },
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
        blockNumber: 12345n,
        gasUsed: 21000n,
      };

      expect(result.result.fileId).toBe(456);
      expect(result.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
      expect(result.blockNumber).toBe(12345n);
      expect(result.gasUsed).toBe(21000n);
    });
  });

  describe("Contract Interaction Types", () => {
    it("should structure contract call correctly", () => {
      const call: ContractCall<[string, number, boolean]> = {
        method: "grantPermission",
        args: ["0x1234567890123456789012345678901234567890", 123, true],
        options: {
          gasLimit: 100000n,
          gasPrice: 20000000000n,
          value: 0n,
        },
      };

      expect(call.method).toBe("grantPermission");
      expect(call.args).toEqual([
        "0x1234567890123456789012345678901234567890",
        123,
        true,
      ]);
      expect(call.options?.gasLimit).toBe(100000n);
      expect(call.options?.gasPrice).toBe(20000000000n);
    });

    it("should handle contract call without options", () => {
      const call: ContractCall<[bigint]> = {
        method: "getPermission",
        args: [789n],
      };

      expect(call.method).toBe("getPermission");
      expect(call.args[0]).toBe(789n);
      expect(call.options).toBeUndefined();
    });

    it("should structure event filter correctly", () => {
      const filter: EventFilter<{ user: Address; amount: bigint }> = {
        event: "PermissionGranted",
        args: {
          user: "0x1234567890123456789012345678901234567890" as Address,
          amount: 1000n,
        },
        fromBlock: 1000n,
        toBlock: 2000n,
        address: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address],
      };

      expect(filter.event).toBe("PermissionGranted");
      expect(filter.args?.user).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(filter.args?.amount).toBe(1000n);
      expect(filter.fromBlock).toBe(1000n);
      expect(filter.toBlock).toBe(2000n);
      expect(Array.isArray(filter.address)).toBe(true);
    });

    it("should structure event log correctly", () => {
      const log: EventLog<{ from: Address; to: Address; value: bigint }> = {
        event: "Transfer",
        args: {
          from: "0x1111111111111111111111111111111111111111" as Address,
          to: "0x2222222222222222222222222222222222222222" as Address,
          value: 500n,
        },
        blockNumber: 15000n,
        transactionHash:
          "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hash,
        logIndex: 2,
        transactionIndex: 5,
        address: "0x3333333333333333333333333333333333333333" as Address,
      };

      expect(log.event).toBe("Transfer");
      expect(log.args.from).toBe("0x1111111111111111111111111111111111111111");
      expect(log.args.to).toBe("0x2222222222222222222222222222222222222222");
      expect(log.args.value).toBe(500n);
      expect(log.blockNumber).toBe(15000n);
      expect(log.logIndex).toBe(2);
      expect(log.transactionIndex).toBe(5);
    });
  });

  describe("Controller and Context Types", () => {
    it("should structure controller context correctly", () => {
      const context: ControllerContext<
        { chainId: number },
        { apiUrl: string }
      > = {
        client: { chainId: 14800 },
        config: { apiUrl: "https://api.vana.org" },
        logger: console,
        cache: new Map(),
      };

      expect(context.client.chainId).toBe(14800);
      expect(context.config?.apiUrl).toBe("https://api.vana.org");
      expect(context.logger).toBe(console);
      expect(context.cache).toBeInstanceOf(Map);
    });

    it("should implement controller interface", () => {
      class TestController implements Controller<{ name: string }> {
        readonly context: { name: string };

        constructor(context: { name: string }) {
          this.context = context;
        }
      }

      const controller = new TestController({ name: "permissions" });
      expect(controller.context.name).toBe("permissions");
    });
  });

  describe("Storage and Cache Interfaces", () => {
    it("should implement storage provider interface", async () => {
      class MockStorageProvider
        implements StorageProvider<{ baseUrl: string }, { compress: boolean }>
      {
        readonly name = "mock-storage";
        readonly config = { baseUrl: "https://storage.example.com" };

        async upload(data: Uint8Array, _options?: { compress: boolean }) {
          return {
            url: `${this.config.baseUrl}/upload/${Date.now()}`,
            size: data.length,
            checksum: "sha256:mockchecksum",
          };
        }

        async download(_url: string, _options?: { compress: boolean }) {
          return {
            data: new Uint8Array([1, 2, 3, 4, 5]),
            size: 5,
            checksum: "sha256:mockchecksum",
          };
        }

        async delete(_url: string) {
          return true;
        }

        async exists(url: string) {
          return url.includes("existing");
        }
      }

      const provider = new MockStorageProvider();
      const uploadResult = await provider.upload(new Uint8Array([1, 2, 3]));
      const downloadResult = await provider.download(
        "https://example.com/file",
      );
      const deleteResult = await provider.delete("https://example.com/file");
      const existsResult = await provider.exists(
        "https://example.com/existing",
      );

      expect(provider.name).toBe("mock-storage");
      expect(uploadResult.size).toBe(3);
      expect(downloadResult.data).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
      expect(deleteResult).toBe(true);
      expect(existsResult).toBe(true);
    });

    it("should implement cache interface", async () => {
      class MockCache implements Cache<string, { value: number }> {
        private store = new Map<
          string,
          { value: { value: number }; expires: number }
        >();

        async get(key: string) {
          const item = this.store.get(key);
          if (!item || Date.now() > item.expires) {
            return undefined;
          }
          return item.value;
        }

        async set(key: string, value: { value: number }, ttl = 60000) {
          this.store.set(key, {
            value,
            expires: Date.now() + ttl,
          });
        }

        async delete(key: string) {
          return this.store.delete(key);
        }

        async clear() {
          this.store.clear();
        }

        async has(key: string) {
          const item = this.store.get(key);
          return !!item && Date.now() <= item.expires;
        }
      }

      const cache = new MockCache();
      await cache.set("test", { value: 42 });
      const result = await cache.get("test");
      const hasResult = await cache.has("test");
      const deleteResult = await cache.delete("test");

      expect(result?.value).toBe(42);
      expect(hasResult).toBe(true);
      expect(deleteResult).toBe(true);
    });
  });

  describe("Configuration Interfaces", () => {
    it("should structure retry config correctly", () => {
      const config: RetryConfig<Error> = {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000,
        jitter: 0.1,
        shouldRetry: (error, attempt) => {
          return error.name !== "ValidationError" && attempt < 3;
        },
      };

      expect(config.maxAttempts).toBe(3);
      expect(config.baseDelay).toBe(1000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.shouldRetry?.(new Error("Network error"), 1)).toBe(true);
      expect(
        config.shouldRetry?.(
          Object.assign(new Error(), { name: "ValidationError" }),
          1,
        ),
      ).toBe(false);
    });

    it("should structure rate limiter config correctly", () => {
      const config: RateLimiterConfig = {
        requestsPerWindow: 100,
        windowMs: 60000,
        burstLimit: 10,
      };

      expect(config.requestsPerWindow).toBe(100);
      expect(config.windowMs).toBe(60000);
      expect(config.burstLimit).toBe(10);
    });
  });

  describe("Plugin and Middleware Interfaces", () => {
    it("should implement middleware interface", async () => {
      class LoggingMiddleware
        implements Middleware<{ method: string }, { status: number }>
      {
        readonly name = "logging";

        async request(req: { method: string }) {
          console.log(`Request: ${req.method}`);
          return req;
        }

        async response(res: { status: number }) {
          console.log(`Response: ${res.status}`);
          return res;
        }

        async error(error: Error, req: { method: string }) {
          console.error(`Error in ${req.method}:`, error.message);
          return { status: 500 };
        }
      }

      const middleware = new LoggingMiddleware();
      const processedRequest = await middleware.request?.({ method: "GET" });
      const processedResponse = await middleware.response?.({ status: 200 });
      const errorResponse = await middleware.error?.(new Error("Test error"), {
        method: "POST",
      });

      expect(middleware.name).toBe("logging");
      expect(processedRequest?.method).toBe("GET");
      expect(processedResponse?.status).toBe(200);
      expect(errorResponse?.status).toBe(500);
    });

    it("should implement plugin interface", async () => {
      class TestPlugin implements Plugin<{ enabled: boolean }> {
        readonly name = "test-plugin";
        readonly version = "1.0.0";
        readonly config = { enabled: true };

        private initialized = false;

        async init() {
          this.initialized = true;
        }

        async cleanup() {
          this.initialized = false;
        }

        isInitialized() {
          return this.initialized;
        }
      }

      const plugin = new TestPlugin();
      expect(plugin.name).toBe("test-plugin");
      expect(plugin.version).toBe("1.0.0");
      expect(plugin.config.enabled).toBe(true);

      await plugin.init?.();
      expect((plugin as any).isInitialized()).toBe(true);

      await plugin.cleanup?.();
      expect((plugin as any).isInitialized()).toBe(false);
    });
  });

  describe("Factory and Repository Interfaces", () => {
    it("should implement factory interface", () => {
      class ConnectionFactory
        implements
          Factory<{ id: string; host: string }, { host: string; port: number }>
      {
        create(params: { host: string; port: number }) {
          return {
            id: `${params.host}:${params.port}`,
            host: params.host,
          };
        }

        createMany(paramsList: { host: string; port: number }[]) {
          return paramsList.map((params) => this.create(params));
        }

        validate(params: { host: string; port: number }) {
          return (
            typeof params.host === "string" &&
            typeof params.port === "number" &&
            params.port > 0
          );
        }
      }

      const factory = new ConnectionFactory();
      const connection = factory.create({ host: "localhost", port: 3000 });
      const connections = factory.createMany?.([
        { host: "server1", port: 3000 },
        { host: "server2", port: 3001 },
      ]);
      const isValid = factory.validate?.({ host: "test", port: 80 });

      expect(connection.id).toBe("localhost:3000");
      expect(connections).toHaveLength(2);
      expect(connections?.[0].host).toBe("server1");
      expect(isValid).toBe(true);
    });

    it("should implement repository interface", async () => {
      interface User {
        id: string;
        name: string;
        email: string;
      }

      class MockUserRepository implements Repository<User, string> {
        private users = new Map<string, User>();

        async findById(id: string) {
          return this.users.get(id);
        }

        async findAll(_options?: any) {
          const users = Array.from(this.users.values());
          return {
            entities: users.slice(0, _options?.limit ?? users.length),
            total: users.length,
            hasMore: (_options?.limit ?? users.length) < users.length,
          };
        }

        async create(entity: Omit<User, "id">) {
          const user: User = { ...entity, id: Date.now().toString() };
          this.users.set(user.id, user);
          return user;
        }

        async update(id: string, updates: Partial<User>) {
          const user = this.users.get(id);
          if (!user) throw new Error("User not found");
          const updated = { ...user, ...updates };
          this.users.set(id, updated);
          return updated;
        }

        async delete(id: string) {
          return this.users.delete(id);
        }

        async exists(id: string) {
          return this.users.has(id);
        }
      }

      const repo = new MockUserRepository();
      const user = await repo.create({
        name: "John",
        email: "john@example.com",
      });
      const foundUser = await repo.findById(user.id);
      const updatedUser = await repo.update(user.id, { name: "Jane" });
      const exists = await repo.exists(user.id);
      const deleted = await repo.delete(user.id);

      expect(foundUser?.name).toBe("John");
      expect(updatedUser.name).toBe("Jane");
      expect(exists).toBe(true);
      expect(deleted).toBe(true);
    });
  });

  describe("Validation and Transformation", () => {
    it("should implement validator interface", () => {
      class EmailValidator implements Validator<{ email: string }> {
        validate(value: unknown): value is { email: string } {
          return (
            typeof value === "object" &&
            value !== null &&
            "email" in value &&
            typeof (value as any).email === "string" &&
            (value as any).email.includes("@")
          );
        }

        getErrors(value: unknown) {
          const errors: string[] = [];
          if (typeof value !== "object" || value === null) {
            errors.push("Value must be an object");
          } else if (!("email" in value)) {
            errors.push("Email field is required");
          } else if (typeof (value as any).email !== "string") {
            errors.push("Email must be a string");
          } else if (!(value as any).email.includes("@")) {
            errors.push("Email must contain @ symbol");
          }
          return errors;
        }

        getSchema() {
          return {
            type: "object",
            properties: {
              email: { type: "string", format: "email" },
            },
            required: ["email"],
          };
        }
      }

      const validator = new EmailValidator();
      const validObject = { email: "test@example.com" };
      const invalidObject = { email: "invalid-email" };

      expect(validator.validate(validObject)).toBe(true);
      expect(validator.validate(invalidObject)).toBe(false);
      expect(validator.getErrors?.(invalidObject)).toContain(
        "Email must contain @ symbol",
      );
      expect(validator.getSchema?.()).toHaveProperty("type", "object");
    });

    it("should implement transformer interface", async () => {
      class JsonTransformer implements Transformer<object, string> {
        transform(input: object) {
          return JSON.stringify(input);
        }

        reverse(output: string) {
          return JSON.parse(output);
        }
      }

      const transformer = new JsonTransformer();
      const object = { name: "test", value: 42 };
      const json = transformer.transform(object);
      const parsed = transformer.reverse?.(json);

      expect(json).toBe('{"name":"test","value":42}');
      expect(parsed).toEqual(object);
    });
  });

  describe("Service and Observer Patterns", () => {
    it("should implement service interface", async () => {
      class TestService implements Service<{ port: number }> {
        readonly name = "test-service";
        readonly config = { port: 3000 };
        private _status: Service["status"] = "idle";

        get status() {
          return this._status;
        }

        async start() {
          this._status = "starting";
          // Simulate startup
          await new Promise((resolve) => setTimeout(resolve, 10));
          this._status = "running";
        }

        async stop() {
          this._status = "stopping";
          // Simulate shutdown
          await new Promise((resolve) => setTimeout(resolve, 10));
          this._status = "stopped";
        }

        async restart() {
          await this.stop();
          await this.start();
        }

        async getHealth() {
          return {
            healthy: this._status === "running",
            details: { uptime: Date.now() },
          };
        }
      }

      const service = new TestService();
      expect(service.status).toBe("idle");

      await service.start();
      expect(service.status).toBe("running");

      const health = await service.getHealth?.();
      expect(health?.healthy).toBe(true);

      await service.restart?.();
      expect(service.status).toBe("running");

      await service.stop();
      expect(service.status).toBe("stopped");
    });

    it("should implement observer pattern", async () => {
      const events: string[] = [];

      class TestObserver implements Observer<string> {
        async notify(event: string) {
          events.push(event);
        }
      }

      class TestObservable implements Observable<string> {
        private observers: Observer<string>[] = [];

        subscribe(observer: Observer<string>) {
          this.observers.push(observer);
          return () => this.unsubscribe(observer);
        }

        unsubscribe(observer: Observer<string>) {
          const index = this.observers.indexOf(observer);
          if (index > -1) {
            this.observers.splice(index, 1);
          }
        }

        emit(event: string) {
          this.observers.forEach((observer) => observer.notify(event));
        }
      }

      const observable = new TestObservable();
      const observer = new TestObserver();
      const unsubscribe = observable.subscribe(observer);

      observable.emit("event1");
      observable.emit("event2");

      // Wait for async notifications
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events).toEqual(["event1", "event2"]);

      unsubscribe();
      observable.emit("event3");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(events).toEqual(["event1", "event2"]); // event3 not added
    });

    it("should implement state machine interface", () => {
      type State = "idle" | "loading" | "success" | "error";
      type Event = "start" | "success" | "error" | "reset";

      class TestStateMachine implements StateMachine<State, Event> {
        private _currentState: State = "idle";

        get currentState() {
          return this._currentState;
        }

        transition(event: Event): State {
          const transitions: Record<State, Partial<Record<Event, State>>> = {
            idle: { start: "loading" },
            loading: { success: "success", error: "error" },
            success: { reset: "idle" },
            error: { reset: "idle" },
          };

          const newState = transitions[this._currentState][event];
          if (newState) {
            this._currentState = newState;
          }
          return this._currentState;
        }

        canTransition(event: Event): boolean {
          const transitions: Record<State, Event[]> = {
            idle: ["start"],
            loading: ["success", "error"],
            success: ["reset"],
            error: ["reset"],
          };

          return transitions[this._currentState].includes(event);
        }

        getAvailableTransitions(): Event[] {
          const transitions: Record<State, Event[]> = {
            idle: ["start"],
            loading: ["success", "error"],
            success: ["reset"],
            error: ["reset"],
          };

          return transitions[this._currentState];
        }
      }

      const stateMachine = new TestStateMachine();
      expect(stateMachine.currentState).toBe("idle");
      expect(stateMachine.canTransition("start")).toBe(true);
      expect(stateMachine.canTransition("success")).toBe(false);

      stateMachine.transition("start");
      expect(stateMachine.currentState).toBe("loading");
      expect(stateMachine.getAvailableTransitions()).toEqual([
        "success",
        "error",
      ]);

      stateMachine.transition("success");
      expect(stateMachine.currentState).toBe("success");
    });
  });

  describe("Helper Types", () => {
    it("should work with ConditionalOptional type", () => {
      interface BaseType {
        id: string;
        name: string;
        optional?: number;
      }

      type WithOptionalId = ConditionalOptional<BaseType, "id", true>;
      type WithRequiredId = ConditionalOptional<BaseType, "id", false>;

      const withOptional: WithOptionalId = { name: "test" };
      const withRequired: WithRequiredId = { id: "123", name: "test" };

      expect(withOptional.name).toBe("test");
      expect(withRequired.id).toBe("123");
      expect(withRequired.name).toBe("test");
    });

    it("should work with PromiseResult type", () => {
      type AsyncNumber = Promise<number>;
      type SyncNumber = number;

      type AsyncResult = PromiseResult<AsyncNumber>; // number
      type SyncResult = PromiseResult<SyncNumber>; // number

      const asyncValue: AsyncResult = 42;
      const syncValue: SyncResult = 24;

      expect(typeof asyncValue).toBe("number");
      expect(typeof syncValue).toBe("number");
    });

    it("should work with utility types", () => {
      interface TestType {
        stringField: string;
        numberField: number;
        booleanField: boolean;
        optionalField?: string;
      }

      type StringFields = PickByType<TestType, string>;
      type NonStringFields = OmitByType<TestType, string>;
      type PartialTest = DeepPartial<TestType>;
      type ReadonlyTest = DeepReadonly<TestType>;
      type RequiredTest = RequireKeys<TestType, "optionalField">;

      const stringFields: StringFields = {
        stringField: "test",
        // optionalField: "optional", // This field shouldn't exist in PickByType<TestType, string>
      };

      const nonStringFields: NonStringFields = {
        numberField: 42,
        booleanField: true,
      };

      const partialTest: PartialTest = {
        stringField: "partial",
      };

      const readonlyTest: ReadonlyTest = {
        stringField: "readonly",
        numberField: 123,
        booleanField: false,
      };

      const requiredTest: RequiredTest = {
        stringField: "test",
        numberField: 42,
        booleanField: true,
        optionalField: "now required",
      };

      expect(stringFields.stringField).toBe("test");
      expect(nonStringFields.numberField).toBe(42);
      expect(partialTest.stringField).toBe("partial");
      expect(readonlyTest.stringField).toBe("readonly");
      expect(requiredTest.optionalField).toBe("now required");
    });

    it("should work with branded and nominal types", () => {
      type UserId = Brand<string, "UserId">;
      type ProductId = Nominal<number, "ProductId">;

      const userId = "user-123" as UserId;
      const productId = 456 as ProductId;

      expect(typeof userId).toBe("string");
      expect(typeof productId).toBe("number");
      expect(userId.toString()).toBe("user-123");
      expect(productId.valueOf()).toBe(456);
    });
  });
});
