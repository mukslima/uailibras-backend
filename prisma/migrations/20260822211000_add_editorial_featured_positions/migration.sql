ALTER TABLE "news"
ADD COLUMN "requestedFeaturedPosition" INTEGER,
ADD COLUMN "featuredPosition" INTEGER;

ALTER TABLE "news"
ADD CONSTRAINT "news_requestedFeaturedPosition_check"
CHECK ("requestedFeaturedPosition" IS NULL OR "requestedFeaturedPosition" IN (1, 2));

ALTER TABLE "news"
ADD CONSTRAINT "news_featuredPosition_check"
CHECK ("featuredPosition" IS NULL OR "featuredPosition" IN (1, 2, 3));

CREATE UNIQUE INDEX "news_featuredPosition_key"
ON "news"("featuredPosition")
WHERE "featuredPosition" IS NOT NULL;

CREATE INDEX "news_featuredPosition_idx" ON "news"("featuredPosition");
