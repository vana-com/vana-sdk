import { describe, it, expect } from "vitest";
import { validateGrantFile } from "../utils/grantFiles";

describe("Grant Files Validation - Uncovered Cases", () => {
  describe("validateGrantFile parameters validation", () => {
    it("should return false when parameters is missing", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        // parameters is missing
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when parameters is null", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: null,
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when parameters is not an object", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: "string instead of object",
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when parameters is a primitive", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: 123,
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });
  });

  describe("validateGrantFile expires validation", () => {
    it("should return false when expires is negative", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        expires: -1,
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when expires is not an integer", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        expires: 1640995200.5, // decimal value
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when expires is not a number", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        expires: "1640995200", // string instead of number
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when expires is NaN", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        expires: NaN,
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });

    it("should return false when expires is Infinity", () => {
      const invalidGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4" },
        expires: Infinity,
      };

      const result = validateGrantFile(invalidGrantFile);
      expect(result).toBe(false);
    });
  });

  describe("validateGrantFile valid cases for coverage completeness", () => {
    it("should return true for valid grant file with expires", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        parameters: { model: "gpt-4", prompt: "test" },
        expires: 1640995200,
      };

      const result = validateGrantFile(validGrantFile);
      expect(result).toBe(true);
    });

    it("should return true for valid grant file without expires", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "data_analysis",
        parameters: { analysisType: "sentiment" },
      };

      const result = validateGrantFile(validGrantFile);
      expect(result).toBe(true);
    });

    it("should return true for valid grant file with complex parameters", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "model_training",
        parameters: {
          algorithm: "neural_network",
          hyperparameters: {
            learningRate: 0.001,
            epochs: 100,
            layers: [
              { type: "dense", units: 128 },
              { type: "dropout", rate: 0.2 },
            ],
          },
          metadata: {
            version: "1.0.0",
            author: "data_scientist",
          },
        },
        expires: 1672531200,
      };

      const result = validateGrantFile(validGrantFile);
      expect(result).toBe(true);
    });

    it("should return true when expires is exactly zero", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "compute_task",
        parameters: { taskType: "computation" },
        expires: 0, // exactly zero should be valid
      };

      const result = validateGrantFile(validGrantFile);
      expect(result).toBe(true);
    });

    it("should return true when parameters is an empty object", () => {
      const validGrantFile = {
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "data_sharing",
        parameters: {}, // empty object should be valid
      };

      const result = validateGrantFile(validGrantFile);
      expect(result).toBe(true);
    });
  });
});
