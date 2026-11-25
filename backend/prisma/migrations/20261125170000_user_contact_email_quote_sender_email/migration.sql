-- Agent contact email for the quote header. Null/empty falls back to the login email at register time.
ALTER TABLE "User" ADD COLUMN "contactEmail" TEXT;

-- Snapshot at register so a later profile edit does not rewrite an old PDF. Old quotes stay '' (no email line).
ALTER TABLE "CommercialQuote" ADD COLUMN "senderEmail" TEXT NOT NULL DEFAULT '';
