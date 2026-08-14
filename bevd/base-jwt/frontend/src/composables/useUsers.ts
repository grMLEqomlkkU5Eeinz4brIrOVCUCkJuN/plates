import { ref } from "vue";
import { trpc } from "../lib/trpc";
import { useAsync } from "./useAsync";

export type ManagedUser = Awaited<ReturnType<typeof trpc.user.list.query>>[number];

/**
 * The admin surface, which is admin-only three times over: this composable is only
 * mounted for admins, every procedure it calls is an `adminProcedure`, and the service
 * checks the role again underneath. Only the last of those is a security control - a
 * curious user poking at the console gets a 403, not a user list.
 */
export function useUsers() {
	const { busy, error, run } = useAsync();

	const users = ref<ManagedUser[]>([]);

	const load = () =>
		run(async () => {
			users.value = await trpc.user.list.query();
		});

	const setRole = (target: ManagedUser, role: "user" | "admin") =>
		run(async () => {
			const updated = await trpc.user.setRole.mutate({ userId: target.id, role });

			users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
		});

	const remove = (target: ManagedUser) =>
		run(async () => {
			await trpc.user.delete.mutate({ userId: target.id });

			users.value = users.value.filter((u) => u.id !== target.id);
		});

	return { users, busy, error, load, setRole, remove };
}
