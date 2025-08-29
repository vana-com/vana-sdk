import { describe, it, expect, vi } from "vitest";
import type { Hash } from "viem";
import { FakeWaitForTransactionEvents } from "./FakeWaitForTransactionEvents";

describe("FakeWaitForTransactionEvents", () => {
  it("should return default response when no specific response is set", async () => {
    const fake = new FakeWaitForTransactionEvents();
    const result = await fake.wait("0xsomehash");

    expect(result.hash).toBe("0xdefaulthash");
    expect(result.contract).toBe("DefaultContract");
    expect(result.hasExpectedEvents).toBe(true);
  });

  it("should return specific response when set", async () => {
    const fake = new FakeWaitForTransactionEvents();

    fake.setResponse("0xspecifichash", {
      hash: "0xspecifichash" as Hash,
      from: "0xspecificfrom",
      contract: "SpecificContract",
      fn: "specificFunction",
      expectedEvents: { TestEvent: { value: 123n } },
      allEvents: [],
      hasExpectedEvents: true,
    });

    const result = await fake.wait("0xspecifichash");

    expect(result.hash).toBe("0xspecifichash");
    expect(result.contract).toBe("SpecificContract");
    expect(result.expectedEvents.TestEvent).toEqual({ value: 123n });
  });

  it("should work with vitest mock function", async () => {
    const fake = new FakeWaitForTransactionEvents();

    fake.setResponse("0xTransactionHash", {
      hash: "0xTransactionHash" as Hash,
      from: "0xTestAddress",
      contract: "DataRefinerRegistry",
      fn: "addSchema",
      expectedEvents: {
        SchemaAdded: {
          schemaId: 123n,
          name: "Test Schema",
          dialect: "jsonschema",
          definitionUrl: "https://ipfs.io/ipfs/QmTestHash",
        },
      },
      allEvents: [],
      hasExpectedEvents: true,
    });

    // Create mock function using the fake
    const mockFn = vi.fn().mockImplementation(fake.asMockFunction());

    // Call with the hash
    const result = await mockFn("0xTransactionHash");

    expect(result.expectedEvents.SchemaAdded.schemaId).toBe(123n);
    expect(mockFn).toHaveBeenCalledWith("0xTransactionHash");
  });

  it("should allow attaching fake to mock for test access", async () => {
    const fake = new FakeWaitForTransactionEvents();
    const mockFn = vi.fn().mockImplementation(fake.asMockFunction());

    // Attach fake to mock for test access
    interface MockWithFake {
      __fake: FakeWaitForTransactionEvents;
    }
    (mockFn as unknown as MockWithFake).__fake = fake;

    // Access the fake and set a response
    const attachedFake = (mockFn as unknown as MockWithFake).__fake;
    attachedFake.setResponse("0xtest", {
      hash: "0xtest" as Hash,
      from: "0xfrom",
      contract: "TestContract",
      fn: "testFn",
      expectedEvents: { TestEvent: { id: 456n } },
      allEvents: [],
      hasExpectedEvents: true,
    });

    const result = await mockFn("0xtest");
    expect(result.expectedEvents.TestEvent.id).toBe(456n);
  });
});
