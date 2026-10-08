import { type } from "arktype";
import { ListPostsInput } from "../services/post.service";

/**
 * `GET /api/v1/posts`, read from a query string.
 *
 * Everything in a query string is a string, so `?limit=10` cannot meet ListPostsInput's
 * `number.integer` as it stands. This parses the two fields and then pipes the result
 * into ListPostsInput itself, so the bounds (1 to 100) are checked by the same schema
 * tRPC's post.list uses rather than restated here.
 *
 * Kept out of rest/routes so the OpenAPI generator can import it without loading the
 * cookie code, which validates the environment on import.
 */
export const ListPostsQuery = type({
	"limit?": "string.integer.parse",
	"publishedOnly?": type("'true' | 'false'").pipe((flag) => flag === "true"),
}).pipe(ListPostsInput);
