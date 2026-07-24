CREATE TABLE `bot_sessions` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`workout_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`message_id` integer,
	`current_exercise_id` integer,
	`pending_weight_kg` real,
	`pending_reps` integer,
	`next_set_is_warmup` integer DEFAULT false NOT NULL,
	`ephemeral_message_id` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
