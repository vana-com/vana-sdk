import { describe, it, expect, beforeEach } from "vitest";
import { FakeStorageManager } from "./FakeStorageManager";

describe("FakeStorageManager", () => {
  let fake: FakeStorageManager;

  beforeEach(() => {
    fake = new FakeStorageManager();
  });

  describe("upload", () => {
    it("should upload and return a URL", async () => {
      const blob = new Blob(["test content"], { type: "text/plain" });
      const result = await fake.upload(blob, "test.txt");

      expect(result.url).toContain("https://");
      expect(result.url).toContain("ipfs");
      expect(result.size).toBe(blob.size);
      expect(result.contentType).toBe("text/plain");
    });

    it("should increment upload count", async () => {
      const blob = new Blob(["test"]);

      expect(fake.getUploadCallCount()).toBe(0);

      await fake.upload(blob, "file1.txt");
      expect(fake.getUploadCallCount()).toBe(1);

      await fake.upload(blob, "file2.txt");
      expect(fake.getUploadCallCount()).toBe(2);
    });

    it("should use specified provider", async () => {
      const blob = new Blob(["test"]);
      fake.register("custom", {
        upload: async () => ({
          url: "https://custom.io/file",
          size: 1024,
          contentType: "application/octet-stream",
        }),
        download: async () => new Blob(),
        list: async () => [],
        delete: async () => true,
        getConfig: () => ({
          name: "custom",
          type: "custom" as const,
          requiresAuth: false,
          features: {
            upload: true,
            download: true,
            list: true,
            delete: true,
          },
        }),
      });

      const result = await fake.upload(blob, "test.txt", "custom");
      expect(result.url).toContain("custom");
    });
  });

  describe("download", () => {
    it("should return default content for unknown URLs", async () => {
      const blob = await fake.download("https://unknown.url");
      const text = await blob.text();
      expect(text).toBe("default content");
    });

    it("should return configured content", async () => {
      const testBlob = new Blob(["specific content"]);
      fake.setDownloadResult("https://test.url", testBlob);

      const blob = await fake.download("https://test.url");
      const text = await blob.text();
      expect(text).toBe("specific content");
    });

    it("should increment download count", async () => {
      expect(fake.getDownloadCallCount()).toBe(0);

      await fake.download("url1");
      expect(fake.getDownloadCallCount()).toBe(1);

      await fake.download("url2");
      expect(fake.getDownloadCallCount()).toBe(2);
    });
  });

  describe("list", () => {
    it("should list uploaded files", async () => {
      await fake.upload(new Blob(["1"]), "file1.txt");
      await fake.upload(new Blob(["2"]), "file2.txt");

      const files = await fake.list();
      expect(files).toHaveLength(2);
      expect(files[0].url).toContain("QmTest1");
      expect(files[1].url).toContain("QmTest2");
    });

    it("should filter by prefix", async () => {
      await fake.upload(new Blob(["1"]), "file1.txt");
      await fake.upload(new Blob(["2"]), "file2.txt");

      const files = await fake.list({ namePattern: "QmTest1" });
      expect(files).toHaveLength(1);
      expect(files[0].url).toContain("QmTest1");
    });
  });

  describe("delete", () => {
    it("should delete uploaded files", async () => {
      const result = await fake.upload(new Blob(["test"]), "file.txt");

      let files = await fake.list();
      expect(files).toHaveLength(1);

      const deleted = await fake.delete(result.url);
      expect(deleted).toBe(true);

      files = await fake.list();
      expect(files).toHaveLength(0);
    });

    it("should return false for non-existent files", async () => {
      const deleted = await fake.delete("https://nonexistent.url");
      expect(deleted).toBe(false);
    });
  });

  describe("provider management", () => {
    it("should register and get providers", () => {
      const mockProvider = {
        upload: async () => ({
          url: "test",
          size: 0,
          contentType: "application/octet-stream",
        }),
        download: async () => new Blob(),
        list: async () => [],
        delete: async () => true,
        getConfig: () => ({
          name: "custom",
          type: "custom",
          requiresAuth: false,
          features: {
            upload: true,
            download: true,
            list: true,
            delete: true,
          },
        }),
      };

      fake.register("custom", mockProvider);

      // getProvider now throws if not found, so we check via listProviders
      expect(fake.listProviders()).toContain("custom");
      const provider = fake.getProvider("custom");
      expect(provider).toBe(mockProvider);

      const providers = fake.listProviders();
      expect(providers).toContain("custom");
      expect(providers).toContain("ipfs");
    });

    it("should set and get default provider", () => {
      fake.register("custom", {
        upload: async () => ({
          url: "test",
          size: 1024,
          contentType: "application/octet-stream",
        }),
        download: async () => new Blob(),
        list: async () => [],
        delete: async () => true,
        getConfig: () => ({
          name: "custom",
          type: "custom" as const,
          requiresAuth: false,
          features: {
            upload: true,
            download: true,
            list: true,
            delete: true,
          },
        }),
      });

      expect(fake.getDefaultProvider()).toBe("ipfs");

      fake.setDefaultProvider("custom");
      expect(fake.getDefaultProvider()).toBe("custom");
    });

    it("should throw when setting non-existent provider as default", () => {
      expect(() => {
        fake.setDefaultProvider("nonexistent");
      }).toThrow("Provider nonexistent not registered");
    });
  });

  describe("reset", () => {
    it("should clear all state", async () => {
      await fake.upload(new Blob(["test"]), "file.txt");
      fake.setDownloadResult("url", new Blob(["content"]));

      expect(fake.getUploadCallCount()).toBe(1);
      expect(await fake.list()).toHaveLength(1);

      fake.reset();

      expect(fake.getUploadCallCount()).toBe(0);
      expect(await fake.list()).toHaveLength(0);

      const blob = await fake.download("url");
      const text = await blob.text();
      expect(text).toBe("default content");
    });
  });
});
