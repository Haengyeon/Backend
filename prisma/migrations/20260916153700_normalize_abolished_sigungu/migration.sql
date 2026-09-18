-- 폐지된 시군구를 현행 코드로 옮긴다.
--
-- 마산시·진해시(2010 창원 통합), 청원군(2014 청주), 남·북제주군(2006)이
-- TourAPI 목록에 아직 남아 있어 매칭 선택지에 노출되고 있었다.
-- 한 명이 "창원시", 다른 한 명이 "마산시"를 고르면 같은 곳인데 영영 안 맞물린다.

-- 매칭 조건. 옮기면서 겹치는 조건이 생기므로(마산시·진해시 -> 둘 다 창원시)
-- 아래에서 순위가 높은 쪽을 남긴다.
UPDATE "MatchingRegionPreference" SET "sigunguCode" = '10' WHERE "region" = 'CHUNGBUK'  AND "sigunguCode" = '9';
UPDATE "MatchingRegionPreference" SET "sigunguCode" = '16' WHERE "region" = 'GYEONGNAM' AND "sigunguCode" IN ('6', '14');
UPDATE "MatchingRegionPreference" SET "sigunguCode" = '3'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '1';
UPDATE "MatchingRegionPreference" SET "sigunguCode" = '4'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '2';

DELETE FROM "MatchingRegionPreference" a
USING "MatchingRegionPreference" b
WHERE a."matchingId" = b."matchingId"
  AND a."region" = b."region"
  AND a."sigunguCode" = b."sigunguCode"
  AND (a."priority", a."id") > (b."priority", b."id");

-- 확정된 매칭과 코스도 같이. 아직 코스가 안 만들어진 건이 남아 있으면
-- 폐지 코드로 TourAPI를 조회하게 되고, 후보가 없어 생성이 실패한다.
UPDATE "MatchAttempt" SET "sigunguCode" = '10' WHERE "region" = 'CHUNGBUK'  AND "sigunguCode" = '9';
UPDATE "MatchAttempt" SET "sigunguCode" = '16' WHERE "region" = 'GYEONGNAM' AND "sigunguCode" IN ('6', '14');
UPDATE "MatchAttempt" SET "sigunguCode" = '3'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '1';
UPDATE "MatchAttempt" SET "sigunguCode" = '4'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '2';

UPDATE "Course" SET "sigunguCode" = '10' WHERE "region" = 'CHUNGBUK'  AND "sigunguCode" = '9';
UPDATE "Course" SET "sigunguCode" = '16' WHERE "region" = 'GYEONGNAM' AND "sigunguCode" IN ('6', '14');
UPDATE "Course" SET "sigunguCode" = '3'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '1';
UPDATE "Course" SET "sigunguCode" = '4'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '2';

-- 이미 찍힌 스탬프도 같이. 아래 마이그레이션에서 시군구 기준으로 중복을 합친다.
UPDATE "Stamp" SET "sigunguCode" = '10' WHERE "region" = 'CHUNGBUK'  AND "sigunguCode" = '9';
UPDATE "Stamp" SET "sigunguCode" = '16' WHERE "region" = 'GYEONGNAM' AND "sigunguCode" IN ('6', '14');
UPDATE "Stamp" SET "sigunguCode" = '3'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '1';
UPDATE "Stamp" SET "sigunguCode" = '4'  WHERE "region" = 'JEJU'      AND "sigunguCode" = '2';
