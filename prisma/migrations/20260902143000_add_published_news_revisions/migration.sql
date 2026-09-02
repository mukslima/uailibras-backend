ALTER TABLE "news" ADD COLUMN "revisionOfId" UUID;

ALTER TABLE "news" ADD CONSTRAINT "news_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "news"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "news_revisionOfId_idx" ON "news"("revisionOfId");
