CREATE TABLE "token_metadata" (
	"token_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"traits" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
