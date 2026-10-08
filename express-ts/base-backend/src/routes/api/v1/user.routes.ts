import { Router } from "express";
import { validate } from "../../../middleware/validate";
import {
	createUserSchema,
	listUsersQuerySchema,
	updateUserSchema,
	userIdParamsSchema,
} from "../../../models/user.model";
import {
	createUser,
	getUsers,
	getUserById,
	updateUser,
	deleteUser,
} from "../../../controllers/user.controller";

const router = Router();

router.get(
	"/",
	validate({ query: listUsersQuerySchema }),
	getUsers
);

router.post(
	"/",
	validate({ body: createUserSchema }),
	createUser
);

router.get(
	"/:id",
	validate({ params: userIdParamsSchema }),
	getUserById
);

router.patch(
	"/:id",
	validate({ params: userIdParamsSchema, body: updateUserSchema }),
	updateUser
);

router.delete(
	"/:id",
	validate({ params: userIdParamsSchema }),
	deleteUser
);

export default router;
