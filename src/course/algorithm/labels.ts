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
