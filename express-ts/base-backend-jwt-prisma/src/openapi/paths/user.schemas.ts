import { accountSchema, publicUserSchema } from "../../models/user.model";
import { named } from "../registry";

// Both the auth and the users areas return an account, so the names live here
// rather than in either; naming one schema twice is an error.
export const account = named("Account", accountSchema);
export const publicUser = named("PublicUser", publicUserSchema);
