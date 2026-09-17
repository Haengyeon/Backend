-- 스탬프의 단위를 지도 칸에서 시군구로 바꾼다.
--
-- 칸으로 잡으면 수원시를 골라 다녀와도 4칸 중 어디가 칠해질지 고를 수 없어
-- 수집률 100%가 영영 안 나온다. 고를 수 있는 단위로 세야 달성 가능한 수가 된다.
-- 지도에 칠할 칸은 읽을 때 코드가 펴 준다(수원시 -> 4칸).
--
-- 폐지 코드 정규화는 앞 마이그레이션에서 끝나 있다.

-- 1. 같은 시군구가 여러 행이 된 것을 하나로. 수원 장안구와 영통구가 따로 쌓여 있던 경우다.
--    먼저 받은 것을 남긴다 — 스탬프는 "처음 다녀온 날"이 의미가 있다.
DELETE FROM "Stamp" a
USING "Stamp" b
WHERE a."userId" = b."userId"
  AND a."region" = b."region"
  AND a."sigunguCode" = b."sigunguCode"
  AND (a."earnedAt", a."id") > (b."earnedAt", b."id");

-- 2. 신원을 시군구로 옮긴다
DROP INDEX IF EXISTS "Stamp_userId_mapSigunguCode_key";
ALTER TABLE "Stamp" DROP COLUMN "mapSigunguCode";
CREATE UNIQUE INDEX "Stamp_userId_region_sigunguCode_key" ON "Stamp"("userId", "region", "sigunguCode");

-- 3. 표준코드는 기록용이라 없어도 된다. 있으면 좋고, TourAPI가 안 주는 장소 때문에
--    스탬프를 통째로 버리는 게 더 손해다
ALTER TABLE "Stamp" ALTER COLUMN "legalSigunguCode" DROP NOT NULL;
