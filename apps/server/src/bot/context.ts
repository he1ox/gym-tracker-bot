import type { UserRow } from '@gym-tracker/db';
import type { Context } from 'grammy';

// La Task 15 amplía este tipo con el flavor de @grammyjs/conversations.
export interface CustomContext extends Context {
  user: UserRow;
}
