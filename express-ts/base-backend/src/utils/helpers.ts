export const stringToArray = (val: string) => val.split(",").map((s) => s.trim()).filter(Boolean);
