import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostsPanel from "./PostsPanel.vue";

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();

// The component talks to the real client module, so that is what gets stubbed.
vi.mock("../lib/trpc", () => ({
	trpc: {
		post: {
			list: { query: (...args: unknown[]) => list(...args) },
			create: { mutate: (...args: unknown[]) => create(...args) },
			update: { mutate: (...args: unknown[]) => update(...args) },
			delete: { mutate: (...args: unknown[]) => remove(...args) },
		},
	},
}));

function post(overrides: Record<string, unknown> = {}) {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		title: "Hello",
		body: "World",
		published: false,
		// ISO strings, not Dates: tRPC serializes with plain JSON, so a Date the server
		// returns arrives here as a string - and the inferred client types say exactly
		// that. (Add superjson as a transformer on both ends if you want real Dates.)
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("PostsPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		list.mockResolvedValue([post()]);
	});

	it("renders the posts it loads on mount", async () => {
		const wrapper = mount(PostsPanel);
		await flushPromises();

		expect(list).toHaveBeenCalledWith({ limit: 20 });
		expect(wrapper.text()).toContain("Hello");
		expect(wrapper.text()).toContain("draft");
	});

	it("creates a post and puts it at the top", async () => {
		create.mockResolvedValue(
			post({ id: "22222222-2222-4222-8222-222222222222", title: "Fresh" }),
		);

		const wrapper = mount(PostsPanel);
		await flushPromises();

		await wrapper.find("input").setValue("Fresh");
		await wrapper.find("textarea").setValue("Body");
		await wrapper.find("form").trigger("submit");
		await flushPromises();

		expect(create).toHaveBeenCalledWith({ title: "Fresh", body: "Body" });

		const titles = wrapper.findAll("li strong").map((node) => node.text());
		expect(titles).toEqual(["Fresh", "Hello"]);
	});

	it("toggles published state", async () => {
		update.mockResolvedValue(post({ published: true }));

		const wrapper = mount(PostsPanel);
		await flushPromises();

		await wrapper.find("li .actions button").trigger("click");
		await flushPromises();

		expect(update).toHaveBeenCalledWith({
			id: "11111111-1111-4111-8111-111111111111",
			published: true,
		});
		expect(wrapper.text()).toContain("published");
	});

	it("surfaces a failed call instead of swallowing it", async () => {
		list.mockRejectedValue(new Error("backend is down"));

		const wrapper = mount(PostsPanel);
		await flushPromises();

		expect(wrapper.find('[role="alert"]').text()).toBe("backend is down");
	});
});
