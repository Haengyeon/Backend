// 테마 코스 구성표 - 기획 바뀌면 여기만 수정하면 됨
import { CourseTheme } from '../../generated/prisma/enums';
import { CONTENT_TYPE_TOURIST_SPOT } from './tour-category';
import { SlotSpec, SpotFilter } from './types';

//코스 1개당 스팟 수
export const SPOT_COUNT = 4;

// ─── 관광 API 분류코드 요약 (lclsSystm1 / lclsSystm2) ───────────────
//  NA 자연관광   NA01 산 · NA02 하천·해양 · NA03 자연생태 · NA04 자연공원 · NA05 기타
//  HS 역사관광   HS01 역사유적지 · HS02 역사유물 · HS03 종교성지 · HS04 안보관광지
//  VE 문화관광   VE01 랜드마크 · VE03 도시공원 · VE04 도시·지역문화 · VE05 복합관광시설
//               VE06 공연시설 · VE07 전시시설 · VE10 레저스포츠시설 · VE12 기타
//  FD 음식       FD01 한식 · FD02 외국식 · FD03 간이음식 · FD04 주점 · FD05 카페·찻집
//  LS 레저스포츠 LS01 육상 · LS02 수상 · LS03 항공 · LS04 복합
//  EX 체험관광   EX01 전통체험 · EX02 공예체험 · EX03 농산어촌 · EX05 웰니스 · EX07 기타
//  SH 쇼핑       SH06 시장
//  contentTypeId=12 는 '관광지' 타입 전체
//
// 분류체계에 없어 구현하지 못한 것: 한옥 찻집 / 대형·로컬 카페 / 양식·일식 구분

// 정규 식사
// FD01 한식 · FD02 외국식 · FD03 간이음식
// (FD04 주점, FD05 카페는 제외)
const MEAL: SpotFilter = {
  categories: [{ lclsSystm1: 'FD', lclsSystm2: ['FD01', 'FD02', 'FD03'] }],
};

// 외국식
// FD02 외국식
// 양식·일식을 나누는 분류가 없어 이 하나로 대체
const FOREIGN_MEAL: SpotFilter = {
  categories: [{ lclsSystm1: 'FD', lclsSystm2: ['FD02'] }],
};

// 카페
// FD05 카페·찻집
const CAFE: SpotFilter = {
  categories: [{ lclsSystm1: 'FD', lclsSystm2: ['FD05'] }],
};

// 자연·걷기
// NA02 하천·해양 · NA03 자연생태 · NA04 자연공원 · NA05 기타자연관광 · VE03 도시공원
// NA01(산)은 첫 만남 TPO에 안 맞아 블랙리스트로 제외
// 도심 공원 상당수가 NA05와 VE03에 흩어져 있어 함께 본다
const NATURE_WALK: SpotFilter = {
  categories: [
    { lclsSystm1: 'NA', lclsSystm2: ['NA02', 'NA03', 'NA04', 'NA05'] },
    { lclsSystm1: 'VE', lclsSystm2: ['VE03'] },
  ],
};

// 산책·공원 (야경데이트 오전 슬롯)
// NA04 자연공원 · NA05 기타자연관광 · VE03 도시공원
const PARK_WALK: SpotFilter = {
  categories: [
    { lclsSystm1: 'NA', lclsSystm2: ['NA04', 'NA05'] },
    { lclsSystm1: 'VE', lclsSystm2: ['VE03'] },
  ],
};

// 실내 역사·전시 (폐관 전에 들르도록 오전 슬롯용)
// VE07 전시시설 · HS01 역사유적지 · HS02 역사유물 · HS03 종교성지

const INDOOR_HISTORY: SpotFilter = {
  categories: [
    { lclsSystm1: 'VE', lclsSystm2: ['VE07'] },
    { lclsSystm1: 'HS', lclsSystm2: ['HS01', 'HS02', 'HS03'] },
  ],
};

// 역사 전반 (실내·야외 구분 없이)
// HS01 역사유적지 · HS02 역사유물 · HS03 종교성지 · VE07 전시시설 · NA04 자연공원

const HISTORY_ALL: SpotFilter = {
  categories: [
    { lclsSystm1: 'HS', lclsSystm2: ['HS01', 'HS02', 'HS03'] },
    { lclsSystm1: 'VE', lclsSystm2: ['VE07'] },
    { lclsSystm1: 'NA', lclsSystm2: ['NA04'] },
  ],
};

// 야외 고궁·역사공원
// HS01 역사유적지 · NA04 자연공원
const OUTDOOR_HISTORY: SpotFilter = {
  categories: [
    { lclsSystm1: 'HS', lclsSystm2: ['HS01'] },
    { lclsSystm1: 'NA', lclsSystm2: ['NA04'] },
  ],
};

// 예술
// VE06 공연시설 · VE07 전시시설
const ART: SpotFilter = {
  categories: [{ lclsSystm1: 'VE', lclsSystm2: ['VE06', 'VE07'] }],
};

// 공방·체험·공연
// EX01 전통체험 · EX02 공예체험 · EX03 농산어촌 · EX07 기타체험 · VE06 공연시설
// EX05(웰니스·스파)는 첫 만남 TPO에 안 맞아 블랙리스트로 제외
const CRAFT_EXPERIENCE: SpotFilter = {
  categories: [
    { lclsSystm1: 'EX', lclsSystm2: ['EX01', 'EX02', 'EX03', 'EX07'] },
    { lclsSystm1: 'VE', lclsSystm2: ['VE06'] },
  ],
};

// 사진명소
// contentTypeId=12 (관광지) 전체
// '포토스팟' 분류가 없어 관광지 전체를 대상으로 한다
// 그래서 사적지 표석 같은 것이 섞일 수 있음 (미해결)
const PHOTO: SpotFilter = { contentTypeId: CONTENT_TYPE_TOURIST_SPOT };

// 해질녘 슬롯에서 우선할 제목 키워드
// 분류로는 못 거르는 '노을 볼 만한 곳'을 정렬 우선순위로만 반영한다
const SUNSET_KEYWORDS = ['야경', '노을', '일몰', '전망', '타워', '스카이'];

// 가벼운 산책·전시 (야경 전까지 둘러볼 곳)
// NA02 하천·해양 · NA03 자연생태 · NA04 자연공원 · NA05 기타자연관광
// VE03 도시공원 · VE07 전시시설
const LIGHT_EXHIBIT_WALK: SpotFilter = {
  categories: [
    { lclsSystm1: 'NA', lclsSystm2: ['NA02', 'NA03', 'NA04', 'NA05'] },
    { lclsSystm1: 'VE', lclsSystm2: ['VE03', 'VE07'] },
  ],
};

// 야경·전망대
// VE01 랜드마크 · VE05 복합관광시설
// 분류체계에 '야경'이 없어 제목 키워드를 대안으로 인정(ALTERNATIVE)
// 분류가 안 맞아도 이름에 야경·전망·타워가 들어가면 후보로 본다
const NIGHT_VIEW: SpotFilter = {
  categories: [{ lclsSystm1: 'VE', lclsSystm2: ['VE01', 'VE05'] }],
  titleKeywords: ['야경', '전망', '타워'],
  keywordMode: 'ALTERNATIVE',
};

// 전통시장
// SH06 시장 (서울 67 / 부산 36건)
const MARKET: SpotFilter = {
  categories: [{ lclsSystm1: 'SH', lclsSystm2: ['SH06'] }],
};

// 레저스포츠
// LS01 육상 · LS02 수상 · LS04 복합
// LS03(항공)은 전국 1건이라 제외
// 지역별로 어느 중분류가 많은지는 직관과 다르므로(서울은 복합 1건, 수상 13건)
// 셋을 열어두고 실제 후보가 있는 것이 선택되게 둔다
const LEISURE: SpotFilter = {
  categories: [{ lclsSystm1: 'LS', lclsSystm2: ['LS01', 'LS02', 'LS04'] }],
};

// 테마별 스팟 구성.
// 로컬맛집·사진명소를 뺀 나머지는 4칸 전부 테마 활동으로 채움
// 4칸이 같은 성격이면 시간대 제약이 사라져 순서가 자유로워진다.
// 시간 의미가 남는 칸만 자리를 지킨다 - 실내 전시는 폐관 전(오전), 야경은 해 진 뒤.

export const COURSE_TEMPLATE: Record<CourseTheme, SlotSpec[]> = {
  // 자연·공원 4곳. 마지막은 노을 볼 만한 곳 우선.
  [CourseTheme.NATURE_HEALING]: [
    { role: '자연·공원', filter: NATURE_WALK },
    { role: '자연·공원', filter: NATURE_WALK, distinctFromOrder: 1 },
    { role: '자연·공원', filter: NATURE_WALK, distinctFromOrder: 2 },
    {
      role: '노을·자연',
      filter: NATURE_WALK,
      distinctFromOrder: 3,
      preferTitleKeywords: SUNSET_KEYWORDS,
    },
  ],

  [CourseTheme.WALKING_TRIP]: [
    { role: '걷기·공원', filter: NATURE_WALK },
    { role: '걷기·공원', filter: NATURE_WALK, distinctFromOrder: 1 },
    { role: '걷기·공원', filter: NATURE_WALK, distinctFromOrder: 2 },
    {
      role: '노을·산책',
      filter: NATURE_WALK,
      distinctFromOrder: 3,
      preferTitleKeywords: SUNSET_KEYWORDS,
    },
  ],

  // 실내 전시는 폐관 전에 가도록 오전 고정, 야외는 뒤로.
  [CourseTheme.HISTORY_CULTURE]: [
    { role: '실내 역사·전시', filter: INDOOR_HISTORY },
    { role: '역사', filter: HISTORY_ALL, distinctFromOrder: 1 },
    { role: '역사', filter: HISTORY_ALL, distinctFromOrder: 2 },
    { role: '야외 고궁·역사공원', filter: OUTDOOR_HISTORY },
  ],

  [CourseTheme.ART_SENSIBILITY]: [
    { role: '예술·전시', filter: ART },
    { role: '예술·전시', filter: ART, distinctFromOrder: 1 },
    { role: '예술·전시', filter: ART, distinctFromOrder: 2 },
    { role: '공방·체험', filter: CRAFT_EXPERIENCE },
  ],

  [CourseTheme.ACTIVITY]: [
    { role: '레저', filter: LEISURE },
    { role: '레저', filter: LEISURE, distinctFromOrder: 1 },
    { role: '레저', filter: LEISURE, distinctFromOrder: 2 },
    { role: '레저', filter: LEISURE, distinctFromOrder: 3 },
  ],

  // 야경은 해 진 뒤여야 하므로 4번 고정.
  [CourseTheme.NIGHT_DATE]: [
    { role: '산책·공원', filter: PARK_WALK },
    { role: '산책·전시', filter: LIGHT_EXHIBIT_WALK, distinctFromOrder: 1 },
    { role: '산책·전시', filter: LIGHT_EXHIBIT_WALK, distinctFromOrder: 2 },
    { role: '야경', filter: NIGHT_VIEW },
  ],

  // 아래 둘은 식사·카페를 유지한다.
  [CourseTheme.PHOTO_SPOT]: [
    { role: '사진명소', filter: PHOTO },
    { role: '점심(외국식)', filter: FOREIGN_MEAL },
    { role: '카페', filter: CAFE },
    {
      role: '야경 사진명소',
      filter: PHOTO,
      preferTitleKeywords: SUNSET_KEYWORDS,
    },
  ],

  [CourseTheme.LOCAL_FOOD_MARKET]: [
    { role: '시장 구경', filter: MARKET },
    { role: '점심 맛집', filter: MEAL },
    { role: '카페', filter: CAFE },
    { role: '저녁 맛집', filter: MEAL, distinctFromOrder: 2 },
  ],
};

// 템플릿 복사본을 준다. 원본을 그대로 넘기면 호출부가 고칠 때 상수가 오염된다.
// 스팟 선정은 COURSE_TEMPLATE이 아니라 이 함수를 거쳐야 한다.
export function templateFor(theme: CourseTheme): SlotSpec[] {
  return COURSE_TEMPLATE[theme].map((slot) => ({ ...slot }));
}
