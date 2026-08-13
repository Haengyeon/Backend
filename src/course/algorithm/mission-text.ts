// 미션 타이틀과 설명을 만들어주는 곳
import { TourSpot } from './types';

interface SpotMission {
  title: string;
  description: string;
}

// 분류코드를 보고 장소 성격에 맞는 미션 문구를 만듬
export function buildMission(spot: TourSpot): SpotMission {
  const name = spot.title;

  // 야외 역사유물 — 단일 유물이지만 주변 유적 군락과 함께 산책 코스
  if (spot.lclsSystm2 === 'HS02') {
    return {
      title: `${name} 주변 산책하기`,
      description: `${name}만 보고 지나치지 마세요. 주변 유적지와 절터를 함께 산책하며 둘러보면 훨씬 풍성합니다. 둘이 나란히 걸으며 사진도 한 장 남겨보세요.`,
    };
  }

  if (spot.lclsSystm2 === 'FD05') {
    return {
      title: `${name}에서 함께 사진 남기기`,
      description: `${name}에서 여유롭게 이야기 나누며 두 사람의 첫 사진을 남겨보세요.`,
    };
  }

  if (spot.lclsSystm1 === 'FD') {
    return {
      title: `${name}에서 함께 식사하기`,
      description: `${name}에서 함께 먹은 메뉴를 사진으로 남겨보세요.`,
    };
  }

  if (spot.lclsSystm2 === 'SH06') {
    return {
      title: `${name} 구경하고 먹거리 고르기`,
      description: `${name}을 함께 둘러보며 마음에 든 먹거리 앞에서 사진을 남겨보세요.`,
    };
  }

  return {
    title: `${name}에서 사진 찍기`,
    description: `${name}을 배경으로 인증샷을 남겨보세요.`,
  };
}
