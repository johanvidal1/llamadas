-- Agent job title for the quote signature stamp. Campaign reset keeps User and does not clear this column.
ALTER TABLE "User" ADD COLUMN "cargo" TEXT;

-- Letter snapshot so a later profile edit does not rewrite an old PDF.
ALTER TABLE "CommercialQuote" ADD COLUMN "senderCargo" TEXT NOT NULL DEFAULT '';
