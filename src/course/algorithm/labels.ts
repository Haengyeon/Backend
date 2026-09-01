// 테마 정해지면 title 이랑 descrption 에 넣어줄 말
// title : "${REGION_LABEL} ${THEME_LABEL} 코스"
// description : THEME_DESCRIPTION[theme]
import { CourseTheme, Region } from '../../generated/prisma/enums';

export const REGION_LABEL: Record<Region, string> = {
  [Region.SEOUL]: '서울',
  [Region.BUSAN]: '부산',
  [Region.DAEGU]: '대구',
  [Region.INCHEON]: '인천',
  [Region.GWANGJU]: '광주',
  [Region.DAEJEON]: '대전',
  [Region.ULSAN]: '울산',
  [Region.SEJONG]: '세종',
  [Region.GYEONGGI]: '경기',
  [Region.GANGWON]: '강원',
  [Region.CHUNGBUK]: '충북',
  [Region.CHUNGNAM]: '충남',
  [Region.JEONBUK]: '전북',
  [Region.JEONNAM]: '전남',
  [Region.GYEONGBUK]: '경북',
  [Region.GYEONGNAM]: '경남',
  [Region.JEJU]: '제주',
};

export const THEME_LABEL: Record<CourseTheme, string> = {
  [CourseTheme.NATURE_HEALING]: '자연 힐링',
  [CourseTheme.HISTORY_CULTURE]: '역사 문화',
  [CourseTheme.NIGHT_DATE]: '야경 데이트',
  [CourseTheme.PHOTO_SPOT]: '사진 명소',
  [CourseTheme.LOCAL_FOOD_MARKET]: '로컬 맛집',
  [CourseTheme.ACTIVITY]: '액티비티',
  [CourseTheme.WALKING_TRIP]: '걷기 여행',
  [CourseTheme.ART_SENSIBILITY]: '예술 감성',
};

export const THEME_DESCRIPTION: Record<CourseTheme, string> = {
  [CourseTheme.NATURE_HEALING]: '숲과 바다를 따라 천천히 걷는 힐링 코스',
  [CourseTheme.HISTORY_CULTURE]: '고궁과 유적지를 따라 걷는 역사 코스',
  [CourseTheme.NIGHT_DATE]: '해질녘부터 야경까지 이어지는 저녁 코스',
  [CourseTheme.PHOTO_SPOT]: '어디서 찍어도 그림이 되는 포토 코스',
  [CourseTheme.LOCAL_FOOD_MARKET]: '시장과 노포를 훑는 로컬 미식 코스',
  [CourseTheme.ACTIVITY]: '몸으로 부딪히며 즐기는 액티비티 코스',
  [CourseTheme.WALKING_TRIP]: '골목과 둘레길을 따라 걷는 산책 코스',
  [CourseTheme.ART_SENSIBILITY]: '전시와 공방을 둘러보는 감성 코스',
};

// 실내가 섞여 있는 테마. D-1 예고의 '실내외 여부'에 쓴다.
// 전시·공방(ART_SENSIBILITY)과 박물관(HISTORY_CULTURE)만 실내를 낀다.
export const THEME_INDOOR: Record<CourseTheme, boolean> = {
  [CourseTheme.NATURE_HEALING]: false,
  [CourseTheme.HISTORY_CULTURE]: true,
  [CourseTheme.NIGHT_DATE]: false,
  [CourseTheme.PHOTO_SPOT]: false,
  [CourseTheme.LOCAL_FOOD_MARKET]: false,
  [CourseTheme.ACTIVITY]: false,
  [CourseTheme.WALKING_TRIP]: false,
  [CourseTheme.ART_SENSIBILITY]: true,
};

// D-1 예고의 복장 팁
export const THEME_DRESS_TIP: Record<CourseTheme, string> = {
  [CourseTheme.NATURE_HEALING]:
    '햇빛이 강할 수 있어요. 모자나 선글라스를 챙겨보세요',
  [CourseTheme.HISTORY_CULTURE]: '실내외를 오가니 걸치기 좋은 겉옷을 추천해요',
  [CourseTheme.NIGHT_DATE]: '해가 지면 쌀쌀해져요. 겉옷을 챙기세요',
  [CourseTheme.PHOTO_SPOT]:
    '사진이 많이 남는 코스예요. 마음에 드는 옷을 입어보세요',
  [CourseTheme.LOCAL_FOOD_MARKET]: '많이 걸으니 편한 신발을 추천해요',
  [CourseTheme.ACTIVITY]: '활동량이 많아요. 편한 옷차림이 좋아요',
  [CourseTheme.WALKING_TRIP]: '오래 걷는 코스예요. 편한 신발은 필수예요',
  [CourseTheme.ART_SENSIBILITY]:
    '실내 위주라 온도 차가 있어요. 얇은 겉옷을 챙기세요',
};

// TourAPI 분류코드를 사람이 읽는 이름으로 바꾼다.
// 저장할 때 한 번 변환해서 CourseSpot.category에 넣는다.
// 코드 목록은 course-template.ts 상단 주석 참고.
const CATEGORY_LABEL: Record<string, string> = {
  NA01: '산',
  NA02: '하천·해양',
  NA03: '자연생태',
  NA04: '자연공원',
  NA05: '자연관광',
  HS01: '역사유적지',
  HS02: '역사유물',
  HS03: '종교성지',
  HS04: '안보관광지',
  VE01: '랜드마크',
  VE03: '도시공원',
  VE04: '지역문화',
  VE05: '복합관광시설',
  VE06: '공연시설',
  VE07: '전시시설',
  VE10: '레저스포츠시설',
  VE12: '문화관광',
  FD01: '한식당',
  FD02: '외국식당',
  FD03: '간이음식',
  FD04: '주점',
  FD05: '카페',
  LS01: '육상레저',
  LS02: '수상레저',
  LS03: '항공레저',
  LS04: '복합레저',
  EX01: '전통체험',
  EX02: '공예체험',
  EX03: '농산어촌체험',
  EX05: '웰니스',
  EX07: '체험관광',
  SH06: '전통시장',
};

// 중분류가 비어 있거나 위 표에 없는 코드일 때 쓸 대분류 이름
const LARGE_CATEGORY_LABEL: Record<string, string> = {
  NA: '자연관광',
  HS: '역사관광',
  VE: '문화관광',
  FD: '음식',
  LS: '레저스포츠',
  EX: '체험관광',
  SH: '쇼핑',
  AC: '숙박',
};

/**
 * 분류코드 -> 한글 카테고리. 중분류를 우선하고, 없으면 대분류로 내려간다.
 * 둘 다 모르는 코드면 null — 화면에서 카테고리 줄을 통째로 숨기라는 뜻이다.
 */
export function categoryLabelOf(
  lclsSystm1: string | null,
  lclsSystm2: string | null,
): string | null {
  if (lclsSystm2 && CATEGORY_LABEL[lclsSystm2])
    return CATEGORY_LABEL[lclsSystm2];
  if (lclsSystm1 && LARGE_CATEGORY_LABEL[lclsSystm1]) {
    return LARGE_CATEGORY_LABEL[lclsSystm1];
  }
  return null;
}

/** 390 -> '6시간 30분'. D-1 예고의 예상 소요시간에 쓴다. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}분`;
  if (rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

// TourAPI가 전국 조회에서는 areaCode를 안 채워 준다.
// 주소 앞부분으로 지역을 되짚는다. ('강원특별자치도', '전북특별자치도'처럼
// 행정구역 이름이 바뀐 곳이 있어 접두어 목록을 따로 둔다)
const REGION_BY_ADDRESS_PREFIX: [string, Region][] = [
  ['서울', Region.SEOUL],
  ['부산', Region.BUSAN],
  ['대구', Region.DAEGU],
  ['인천', Region.INCHEON],
  ['광주광역', Region.GWANGJU],
  ['대전', Region.DAEJEON],
  ['울산', Region.ULSAN],
  ['세종', Region.SEJONG],
  ['경기', Region.GYEONGGI],
  ['강원', Region.GANGWON],
  ['충청북', Region.CHUNGBUK],
  ['충북', Region.CHUNGBUK],
  ['충청남', Region.CHUNGNAM],
  ['충남', Region.CHUNGNAM],
  ['전라북', Region.JEONBUK],
  ['전북', Region.JEONBUK],
  ['전라남', Region.JEONNAM],
  ['전남', Region.JEONNAM],
  ['경상북', Region.GYEONGBUK],
  ['경북', Region.GYEONGBUK],
  ['경상남', Region.GYEONGNAM],
  ['경남', Region.GYEONGNAM],
  ['제주', Region.JEJU],
];

/** 주소 -> 지역. 모르는 주소면 null */
export function regionFromAddress(address: string): Region | null {
  const found = REGION_BY_ADDRESS_PREFIX.find(([prefix]) =>
    address.startsWith(prefix),
  );
  return found ? found[1] : null;
}
