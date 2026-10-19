import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Unknown URLs render the styled 404 page inside the layout instead of the framework default. */
export const load: PageServerLoad = () => error(404, { message: 'Not found' });
