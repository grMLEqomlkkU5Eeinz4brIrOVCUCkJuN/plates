import request from "supertest";
import type { Express } from "express";

export interface TestSession {
	/** "name=value" pairs, ready for a Cookie header. */
	cookies: string[];
	csrfToken: string;
	accessToken: string;
	refreshToken: string;
}

/** First `name=value` segment of each Set-Cookie line. */
export const cookiePairs = (setCookies: string[]): string[] =>
	setCookies.map((cookie) => cookie.split(";")[0]);

const cookieValue = (pairs: string[], name: string): string =>
	pairs.find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1) ??
	"";

/** Log in and collect everything an authenticated request needs. */
export const loginSession = async (
	app: Express,
	email = "user@example.com"
): Promise<TestSession> => {
	const response = await request(app)
		.post("/api/v1/auth/login")
		.send({ email, password: "password123" });

	if (response.status !== 200) {
		throw new Error(`login failed in test setup: ${response.status}`);
	}

	const cookies = cookiePairs(response.get("Set-Cookie") ?? []);

	return {
		cookies,
		csrfToken: response.body.csrfToken as string,
		accessToken: cookieValue(cookies, "access_token"),
		refreshToken: cookieValue(cookies, "refresh_token"),
	};
};

export const asUser = (session: TestSession): { Cookie: string } => ({
	Cookie: session.cookies.join("; "),
});
