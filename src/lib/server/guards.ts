import { error } from '@sveltejs/kit';

type Role = 'ADMIN' | 'MANAGER';

type LocalsLike = { user: App.Locals['user'] };

export function requireUser(locals: LocalsLike): NonNullable<App.Locals['user']> {
	if (!locals.user) throw error(404, 'Not Found');
	return locals.user;
}

export function requireRole(locals: LocalsLike, ...roles: Role[]): NonNullable<App.Locals['user']> {
	const user = requireUser(locals);
	if (!roles.includes(user.role)) throw error(404, 'Not Found');
	return user;
}

export function requireAdmin(locals: LocalsLike): NonNullable<App.Locals['user']> {
	return requireRole(locals, 'ADMIN');
}

export function requireEditor(locals: LocalsLike): NonNullable<App.Locals['user']> {
	return requireRole(locals, 'ADMIN', 'MANAGER');
}
