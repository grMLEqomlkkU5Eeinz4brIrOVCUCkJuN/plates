import { Router } from "express";
import { validate } from "../../../middleware/validate";
import {
	createUserSchema,
	listUsersQuerySchema,
	updateUserSchema,
	userIdParamsSchema,
} from "../../../models/user.model";
import asyncHandler from "../../../utils/asyncHandler";
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
	asyncHandler(getUsers)
);

router.post(
	"/",
	validate({ body: createUserSchema }),
	asyncHandler(createUser)
);

router.get(
	"/:id",
	validate({ params: userIdParamsSchema }),
	asyncHandler(getUserById)
);

router.patch(
	"/:id",
	validate({ params: userIdParamsSchema, body: updateUserSchema }),
	asyncHandler(updateUser)
);

router.delete(
	"/:id",
	validate({ params: userIdParamsSchema }),
	asyncHandler(deleteUser)
);

export default router;
