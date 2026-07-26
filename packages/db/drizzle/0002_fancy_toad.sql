ALTER TABLE `exercises` ADD `name_key` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_user_id` integer NOT NULL,
	`timezone` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`weight_unit` text DEFAULT 'kg' NOT NULL,
	`weight_step` real DEFAULT 2.5 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "users_locale_check" CHECK(locale IN ('es', 'en')),
	CONSTRAINT "users_weight_unit_check" CHECK(weight_unit IN ('kg', 'lb')),
	CONSTRAINT "users_weight_step_check" CHECK(weight_step IN (1, 2.5, 5, 10))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "telegram_user_id", "timezone", "created_at") SELECT "id", "telegram_user_id", "timezone", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_user_id_unique` ON `users` (`telegram_user_id`);--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'bench_press_barbell' WHERE `user_id` IS NULL AND `name` = 'Press de banca con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'incline_press_barbell' WHERE `user_id` IS NULL AND `name` = 'Press inclinado con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'bench_press_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Press de banca con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'fly_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Aperturas con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'dip_parallel_bars' WHERE `user_id` IS NULL AND `name` = 'Fondos en paralelas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'cable_crossover' WHERE `user_id` IS NULL AND `name` = 'Cruce de poleas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'chest_press_machine' WHERE `user_id` IS NULL AND `name` = 'Press de pecho en máquina';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'overhead_press_barbell' WHERE `user_id` IS NULL AND `name` = 'Press militar con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'shoulder_press_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Press de hombro con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'lateral_raise_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Elevaciones laterales con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'lateral_raise_cable' WHERE `user_id` IS NULL AND `name` = 'Elevaciones laterales en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'reverse_fly_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Pájaros con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'reverse_fly_machine' WHERE `user_id` IS NULL AND `name` = 'Aperturas posteriores en máquina';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'pull_up' WHERE `user_id` IS NULL AND `name` = 'Dominadas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'lat_pulldown' WHERE `user_id` IS NULL AND `name` = 'Jalón al pecho en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'row_barbell' WHERE `user_id` IS NULL AND `name` = 'Remo con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'row_dumbbell_one_arm' WHERE `user_id` IS NULL AND `name` = 'Remo con mancuerna a una mano';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'pullover_cable' WHERE `user_id` IS NULL AND `name` = 'Pullover en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'row_machine' WHERE `user_id` IS NULL AND `name` = 'Remo en máquina';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'row_seated_cable' WHERE `user_id` IS NULL AND `name` = 'Remo sentado en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'face_pull_cable' WHERE `user_id` IS NULL AND `name` = 'Face pull en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'deadlift_conventional' WHERE `user_id` IS NULL AND `name` = 'Peso muerto convencional';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'back_extension' WHERE `user_id` IS NULL AND `name` = 'Hiperextensiones';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'good_morning_barbell' WHERE `user_id` IS NULL AND `name` = 'Buenos días con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'shrug_barbell' WHERE `user_id` IS NULL AND `name` = 'Encogimientos con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'shrug_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Encogimientos con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'curl_barbell' WHERE `user_id` IS NULL AND `name` = 'Curl con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'curl_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Curl con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'curl_hammer' WHERE `user_id` IS NULL AND `name` = 'Curl martillo';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'curl_preacher' WHERE `user_id` IS NULL AND `name` = 'Curl en banco Scott';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'triceps_pushdown_cable' WHERE `user_id` IS NULL AND `name` = 'Extensión de tríceps en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'skull_crusher_barbell' WHERE `user_id` IS NULL AND `name` = 'Press francés con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'bench_dip' WHERE `user_id` IS NULL AND `name` = 'Fondos entre bancos';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'triceps_extension_overhead' WHERE `user_id` IS NULL AND `name` = 'Extensión de tríceps sobre la cabeza';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'wrist_curl_barbell' WHERE `user_id` IS NULL AND `name` = 'Curl de muñeca con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'wrist_curl_reverse' WHERE `user_id` IS NULL AND `name` = 'Curl de muñeca invertido';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'crunch' WHERE `user_id` IS NULL AND `name` = 'Encogimientos abdominales';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'hanging_leg_raise' WHERE `user_id` IS NULL AND `name` = 'Elevación de piernas colgado';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'plank' WHERE `user_id` IS NULL AND `name` = 'Plancha abdominal';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'ab_wheel_rollout' WHERE `user_id` IS NULL AND `name` = 'Rueda abdominal';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'squat_barbell' WHERE `user_id` IS NULL AND `name` = 'Sentadilla con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'leg_press' WHERE `user_id` IS NULL AND `name` = 'Prensa de piernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'leg_extension_machine' WHERE `user_id` IS NULL AND `name` = 'Extensión de cuádriceps en máquina';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'lunge_dumbbell' WHERE `user_id` IS NULL AND `name` = 'Zancadas con mancuernas';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'leg_curl_lying' WHERE `user_id` IS NULL AND `name` = 'Curl femoral tumbado';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'romanian_deadlift_barbell' WHERE `user_id` IS NULL AND `name` = 'Peso muerto rumano con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'hip_thrust_barbell' WHERE `user_id` IS NULL AND `name` = 'Hip thrust con barra';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'glute_kickback_cable' WHERE `user_id` IS NULL AND `name` = 'Patada de glúteo en polea';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'hip_adduction_machine' WHERE `user_id` IS NULL AND `name` = 'Aductores en máquina';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'calf_raise_standing' WHERE `user_id` IS NULL AND `name` = 'Elevación de gemelos de pie';--> statement-breakpoint
UPDATE `exercises` SET `name_key` = 'calf_raise_seated' WHERE `user_id` IS NULL AND `name` = 'Elevación de gemelos sentado';