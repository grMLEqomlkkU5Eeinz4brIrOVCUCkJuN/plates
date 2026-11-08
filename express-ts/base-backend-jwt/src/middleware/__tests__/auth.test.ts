import { describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import {
	generateAccessToken,
	generateRefreshToken,
	verifyAccessToken,
	verifyRefreshToken,
} from "../auth";

const claims = { userId: "user-1", email: "user@example.com" };

describe("token algorithms", () => {
	it("signs with HS256", () => {
		expect(jwt.decode(generateAccessToken(claims), { complete: true })?.header.alg).toBe("HS256");
		expect(jwt.decode(generateRefreshToken(claims), { complete: true })?.header.alg).toBe("HS256");
	});

	it("verifies its own tokens", () => {
		expect(verifyAccessToken(generateAccessToken(claims)).userId).toBe("user-1");
		expect(verifyRefreshToken(generateRefreshToken(claims)).userId).toBe("user-1");
	});

	it.each(["HS384", "HS512"] as const)(
		"refuses an access token signed with %s and the right secret",
		(algorithm) => {
			const token = jwt.sign(claims, env.JWT_SECRET, { algorithm });
			expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
		}
	);

	it("refuses a refresh token signed with HS512 and the right secret", () => {
		const token = jwt.sign(claims, env.JWT_REFRESH_SECRET, { algorithm: "HS512" });
		expect(() => verifyRefreshToken(token)).toThrow(jwt.JsonWebTokenError);
	});

	it("refuses an unsigned token", () => {
		const token = jwt.sign(claims, "", { algorithm: "none" });
		expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
	});
});
