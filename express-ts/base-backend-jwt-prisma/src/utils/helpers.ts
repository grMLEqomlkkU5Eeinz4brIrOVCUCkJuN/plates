export const stringToArray = (val: string): string[] =>
	val
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

/**
 * "15m" -> 900. A bare number is read as seconds, which is what both
 * jsonwebtoken and lacewing assume for a token lifetime.
 *
 * This exists so that a cookie's Max-Age can be derived from the token
 * lifetime it is carrying, rather than restated as a second literal that
 * drifts the first time somebody changes one and not the other.
 */
export const durationToSeconds = (value: string): number => {
	const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/.exec(value.trim());

	if (!match?.[1]) {
		throw new Error(
			`Unsupported duration "${value}" - use seconds, or a value like 15m, 1h, 7d`
		);
	}

	const amount = Number(match[1]);

	switch (match[2]) {
		case "ms":
			return Math.floor(amount / 1000);
		case "m":
			return amount * 60;
		case "h":
			return amount * 3600;
		case "d":
			return amount * 86400;
		case "w":
			return amount * 604800;
		default:
			return amount;
	}
};
