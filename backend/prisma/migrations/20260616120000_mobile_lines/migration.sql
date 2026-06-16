-- CreateTable
CREATE TABLE "MobileLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "numeroTelefono" TEXT,
    "estadoLinea" TEXT,
    "plan" TEXT,
    "estado" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileLine_companyId_idx" ON "MobileLine"("companyId");

-- CreateIndex
CREATE INDEX "MobileLine_importBatchId_idx" ON "MobileLine"("importBatchId");

-- AddForeignKey
ALTER TABLE "MobileLine" ADD CONSTRAINT "MobileLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileLine" ADD CONSTRAINT "MobileLine_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
