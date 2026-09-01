// 미션 타이틀과 설명을 만들어주는 곳
import { TourSpot } from './types';

interface SpotMission {
  title: string;
  description: string;
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 마지막 글자에 받침이 있는지. 한글이 아니면 받침 없는 것으로 본다 */
function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1);
  if (!last) return false;

  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return false;

  // 한글 한 글자 = (초성 × 21 + 중성) × 28 + 종성. 나머지가 0이면 종성이 없다
  return (code - HANGUL_START) % 28 !== 0;
}

/**
 * 장소 이름 뒤에 붙일 목적격 조사.
 * 이름이 데이터에서 오기 때문에 '~플라자을'처럼 어색해지는 걸 막는다.
 */
function objectParticle(word: string): string {
  return hasFinalConsonant(word) ? '을' : '를';
}

// 분류코드를 보고 장소 성격에 맞는 미션 문구를 만듬
export function buildMission(spot: TourSpot): SpotMission {
  const name = spot.title;
  const particle = objectParticle(name);

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
      description: `${name}${particle} 함께 둘러보며 마음에 든 먹거리 앞에서 사진을 남겨보세요.`,
    };
  }

  return {
    title: `${name}에서 사진 찍기`,
    description: `${name}${particle} 배경으로 인증샷을 남겨보세요.`,
  };
}
