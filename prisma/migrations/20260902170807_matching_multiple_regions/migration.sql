/*
  Warnings:

  - You are about to drop the column `region` on the `Matching` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Matching" DROP COLUMN "region",
ADD COLUMN     "regions" "Region"[];
