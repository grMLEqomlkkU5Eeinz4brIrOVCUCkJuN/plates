import { describe, expect, it } from "@jest/globals";
import { redactSecrets } from "../logger";

/**
 * The one property of the logger worth a test: a secret handed to it by any
 * name on the list never reaches a transport, however deep it sits.
 */
describe("redactSecrets", () => {
	const redact = (meta: Record<string, unknown>): Record<string, unknown> =>
		redactSecrets().transform({ level: "info", message: "m", ...meta }) as Record<string, unknown>;

	it("removes secrets by key name at the top level and nested", () => {
		const out = redact({
			password: "hunter2",
			refreshToken: "abc",
			body: { email: "a@b.co", csrfToken: "t", headers: { Authorization: "Bearer x", cookie: "c=1" } },
			list: [{ apiSecret: "s" }, "plain"],
		});

		expect(out).toEqual({
			level: "info",
			message: "m",
			password: "[redacted]",
			refreshToken: "[redacted]",
			body: { email: "a@b.co", csrfToken: "[redacted]", headers: { Authorization: "[redacted]", cookie: "[redacted]" } },
			list: [{ apiSecret: "[redacted]" }, "plain"],
		});
	});

	it("leaves the message alone and stops at the depth cap", () => {
		let deep: Record<string, unknown> = { password: "leaf" };
		for (let i = 0; i < 7; i++) deep = { inner: deep };

		const out = redact({ message: "password=in-the-message-is-the-caller's-problem", meta: deep });

		expect(out.message).toBe("password=in-the-message-is-the-caller's-problem");
		expect(JSON.stringify(out.meta)).toContain("[truncated]");
		expect(JSON.stringify(out.meta)).not.toContain("leaf");
	});
});
