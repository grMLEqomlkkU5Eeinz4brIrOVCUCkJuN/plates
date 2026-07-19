export const stringToArray = (val: string): string[] =>
	val
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
