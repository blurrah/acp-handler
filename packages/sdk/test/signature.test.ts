import { describe, it, expect } from "vitest";
import { computeSignature, verifySignature } from "../src/checkout/signature";

describe("Signature Verification", () => {
	const secret = "test_secret_key_12345";

	describe("computeSignature", () => {
		it("should compute HMAC-SHA256 signature", () => {
			const body = '{"items":[{"id":"prod-1","quantity":2}]}';
			const timestamp = "1704067200";

			const signature = computeSignature(body, timestamp, secret);

			expect(signature).toBeDefined();
			expect(signature).toHaveLength(64); // SHA256 hex = 64 chars
		});

		it("should produce consistent signatures for same input", () => {
			const body = '{"test":"data"}';
			const timestamp = "1704067200";

			const sig1 = computeSignature(body, timestamp, secret);
			const sig2 = computeSignature(body, timestamp, secret);

			expect(sig1).toBe(sig2);
		});

		it("should produce different signatures for different bodies", () => {
			const timestamp = "1704067200";

			const sig1 = computeSignature('{"test":"data1"}', timestamp, secret);
			const sig2 = computeSignature('{"test":"data2"}', timestamp, secret);

			expect(sig1).not.toBe(sig2);
		});

		it("should produce different signatures for different timestamps", () => {
			const body = '{"test":"data"}';

			const sig1 = computeSignature(body, "1704067200", secret);
			const sig2 = computeSignature(body, "1704067201", secret);

			expect(sig1).not.toBe(sig2);
		});
	});

	describe("verifySignature", () => {
		it("should verify valid signature", async () => {
			const body = '{"items":[{"id":"prod-1","quantity":2}]}';
			const timestamp = String(Math.floor(Date.now() / 1000));
			const signature = computeSignature(body, timestamp, secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(true);
		});

		it("should reject request without signature header", async () => {
			const body = '{"items":[]}';
			const timestamp = String(Math.floor(Date.now() / 1000));

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					timestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(false);
		});

		it("should reject request without timestamp header", async () => {
			const body = '{"items":[]}';

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature: "fake_signature",
				},
				body,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(false);
		});

		it("should reject request with invalid signature", async () => {
			const body = '{"items":[]}';
			const timestamp = String(Math.floor(Date.now() / 1000));

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature: "invalid_signature_1234567890abcdef",
					timestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(false);
		});

		it("should reject request with tampered body", async () => {
			const originalBody = '{"items":[{"id":"prod-1","quantity":2}]}';
			const tamperedBody = '{"items":[{"id":"prod-1","quantity":999}]}';
			const timestamp = String(Math.floor(Date.now() / 1000));
			const signature = computeSignature(originalBody, timestamp, secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp,
				},
				body: tamperedBody,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(false);
		});

		it("should reject old request (replay attack prevention)", async () => {
			const body = '{"items":[]}';
			const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 400 seconds ago
			const signature = computeSignature(body, oldTimestamp, secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp: oldTimestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, {
				secret,
				toleranceSec: 300, // 5 minutes
			});

			expect(isValid).toBe(false);
		});

		it("should accept recent request within tolerance", async () => {
			const body = '{"items":[]}';
			const timestamp = String(Math.floor(Date.now() / 1000) - 100); // 100 seconds ago
			const signature = computeSignature(body, timestamp, secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, {
				secret,
				toleranceSec: 300, // 5 minutes
			});

			expect(isValid).toBe(true);
		});

		it("should reject request with invalid timestamp format", async () => {
			const body = '{"items":[]}';
			const signature = computeSignature(body, "invalid", secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp: "invalid",
				},
				body,
			});

			const isValid = await verifySignature(req, { secret });

			expect(isValid).toBe(false);
		});

		it("should allow custom tolerance", async () => {
			const body = '{"items":[]}';
			const timestamp = String(Math.floor(Date.now() / 1000) - 7200); // 2 hours ago
			const signature = computeSignature(body, timestamp, secret);

			const req = new Request("http://test", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					signature,
					timestamp,
				},
				body,
			});

			const isValid = await verifySignature(req, {
				secret,
				toleranceSec: 10800, // 3 hours
			});

			expect(isValid).toBe(true);
		});
	});
});
