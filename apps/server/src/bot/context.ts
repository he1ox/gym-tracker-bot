import type { UserRow } from '@gym-tracker/db';
import type { ConversationFlavor } from '@grammyjs/conversations';
import type { Context } from 'grammy';

export type CustomContext = ConversationFlavor<Context> & { user: UserRow };
