import request from "supertest";
import type { Express } from "express";

export interface TestSession {
	userId: string;
	/** "name=value" pairs, ready for a Cookie header. */
	cookies: string[];
	csrfToken: string;
	accessToken: string;
	refreshToken: string;
}

export const PASSWORD = "a-long-enough-password";

/** First `name=value` segment of each Set-Cookie line. */
export const cookiePairs = (setCookies: string[]): string[] =>
	setCookies.map((cookie) => cookie.split(";")[0]);

export const cookieValue = (pairs: string[], name: string): string =>
	pairs.find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";

/**
 * Registers an account and collects everything an authenticated request
 * needs. The auth suite asserts on each of these steps itself; everything
 * else only needs somebody to be signed in.
 */
export const signUp = async (
	app: Express,
	email = "user@example.com",
	name = "Test User"
): Promise<TestSession> => {
	const response = await request(app)
		.post("/api/v1/auth/register")
		.send({ email, name, password: PASSWORD });

	if (response.status !== 201) {
		throw new Error(`register ${email}: ${response.status} ${JSON.stringify(response.body)}`);
	}

	const cookies = cookiePairs(response.get("Set-Cookie") ?? []);

	return {
		userId: response.body.user.id as string,
		cookies,
		csrfToken: response.body.csrfToken as string,
		accessToken: cookieValue(cookies, "access_token"),
		refreshToken: cookieValue(cookies, "refresh_token"),
	};
};

export const asUser = (session: TestSession): Record<string, string> => ({
	Cookie: session.cookies.join("; "),
});

export const withCsrf = (session: TestSession): Record<string, string> => ({
	...asUser(session),
	"x-csrf-token": session.csrfToken,
});
