package com.example.simplebackend.dto;

import java.util.List;

/**
 * One page of a keyset paginated listing. {@code nextAfter} is null on the last
 * page. There is no total count: it would cost a second scan of the table on
 * every request and be stale before the client read it.
 */
public record CursorPageResponse<T>(List<T> items, Long nextAfter) {
}
