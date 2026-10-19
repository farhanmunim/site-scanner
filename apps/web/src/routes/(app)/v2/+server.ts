import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ url }) => redirect(308, `/${url.search}`);
