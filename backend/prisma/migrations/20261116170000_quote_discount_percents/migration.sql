-- Quote-level discounts (25 / 50). Tenant allowed percents survive campaign reset.
-- CommercialQuote.discountPercent is the snapshot used to regenerate the PDF.

ALTER TABLE "Tenant" ADD COLUMN "quoteDiscountPercents" JSONB NOT NULL DEFAULT '[25,50]';

ALTER TABLE "CommercialQuote" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;
