import { describe, it, expect, vi, beforeEach } from "vitest";
import { OperationHandle } from "./operationHandle";
import { PersonalServerError } from "../errors";
import type { ServerController } from "../controllers/server";

describe("OperationHandle", () => {
  let mockController: ServerController;

  beforeEach(() => {
    mockController = {
      getOperation: vi.fn(),
    } as unknown as ServerController;
  });

  describe("waitForResult", () => {
    it("should return result when operation succeeds", async () => {
      const expectedResult = { data: "test" };
      vi.mocked(mockController.getOperation).mockResolvedValue({
        status: "succeeded",
        result: JSON.stringify(expectedResult),
      } as any);

      const handle = new OperationHandle(mockController, "test-id");
      const result = await handle.waitForResult();

      expect(result).toEqual(expectedResult);
      expect(mockController.getOperation).toHaveBeenCalledWith("test-id");
    });

    it("should throw error when operation fails", async () => {
      vi.mocked(mockController.getOperation).mockResolvedValue({
        status: "failed",
        result: "Operation failed",
      } as any);

      const handle = new OperationHandle(mockController, "test-id");

      await expect(handle.waitForResult()).rejects.toThrow(PersonalServerError);
    });

    it("should poll until operation completes", async () => {
      vi.mocked(mockController.getOperation)
        .mockResolvedValueOnce({ status: "pending" } as any)
        .mockResolvedValueOnce({ status: "running" } as any)
        .mockResolvedValueOnce({
          status: "succeeded",
          result: JSON.stringify({ data: "test" }),
        } as any);

      const handle = new OperationHandle(mockController, "test-id");
      const result = await handle.waitForResult({ pollingInterval: 10 });

      expect(result).toEqual({ data: "test" });
      expect(mockController.getOperation).toHaveBeenCalledTimes(3);
    });

    it("should timeout after specified duration", async () => {
      vi.mocked(mockController.getOperation).mockResolvedValue({
        status: "pending",
      } as any);

      const handle = new OperationHandle(mockController, "test-id");

      await expect(
        handle.waitForResult({ timeout: 50, pollingInterval: 10 }),
      ).rejects.toThrow("Operation timed out after 50ms");
    });

    it("should cache result on subsequent calls", async () => {
      const expectedResult = { data: "test" };
      vi.mocked(mockController.getOperation).mockResolvedValue({
        status: "succeeded",
        result: JSON.stringify(expectedResult),
      } as any);

      const handle = new OperationHandle(mockController, "test-id");
      const result1 = await handle.waitForResult();
      const result2 = await handle.waitForResult();

      expect(result1).toBe(result2); // Same reference
      expect(mockController.getOperation).toHaveBeenCalledTimes(1); // Only called once
    });
  });
});
