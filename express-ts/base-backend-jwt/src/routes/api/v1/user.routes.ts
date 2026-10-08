import { Router } from "express";
import { validate } from "../../../middleware/validate";
import { authenticate } from "../../../middleware/auth";
import { doubleCsrfProtection } from "../../../middleware/csrf";
import {
	createUserSchema,
	listUsersQuerySchema,
	updateUserSchema,
	userIdParamsSchema,
} from "../../../models/user.model";
import {
	createUserHandler,
	getUsers,
	getUserById,
	updateUserHandler,
	deleteUser,
} from "../../../controllers/user.controller";

const router = Router();

router.get(
	"/",
	authenticate,
	validate({ query: listUsersQuerySchema }),
	getUsers
);

router.post(
	"/",
	authenticate,
	doubleCsrfProtection,
	validate({ body: createUserSchema }),
	createUserHandler
);

router.get(
	"/:id",
	authenticate,
	validate({ params: userIdParamsSchema }),
	getUserById
);

router.patch(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate({ params: userIdParamsSchema, body: updateUserSchema }),
	updateUserHandler
);

router.delete(
	"/:id",
	authenticate,
	doubleCsrfProtection,
	validate({ params: userIdParamsSchema }),
	deleteUser
);

export default router;
