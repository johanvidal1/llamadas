-- Agent cellphone for the proposal signature. Campaign reset keeps User and does not clear this column.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- Excel fills next to benefits. Plan prices and benefit text stay untouched.
ALTER TABLE "OfferPlan" ADD COLUMN "colors" JSONB;

-- Letter snapshot so a later profile or template edit does not rewrite an old PDF.
ALTER TABLE "CommercialQuote" ADD COLUMN "tableName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CommercialQuote" ADD COLUMN "senderName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CommercialQuote" ADD COLUMN "senderPhone" TEXT NOT NULL DEFAULT '';
