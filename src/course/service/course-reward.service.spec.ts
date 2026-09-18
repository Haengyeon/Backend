// 스탬프는 코스가 지나간 시군구마다 찍힌다.
//
// 까다로운 부분은 "무엇을 하나로 셀 것인가"다. 스팟 네 곳이 같은 구일 수도 있고,
// 지도가 한 시를 여러 칸으로 나눠 그리기도 한다(수원시 = 4칸).
// 세는 단위는 지도 칸이 아니라 시군구다 — 사용자가 매칭에서 고르는 단위와 같아야
// "어디를 가면 채워지는지"가 말이 되기 때문이다.
import { CourseRewardService } from './course-reward.service';
import { Region } from '../../generated/prisma/enums';
import { TxClient } from '../prisma-tx.type';

const COURSE_ID = 'course-1';
const USER_ID = 'user-1';

const JUNGGU = { sigunguCode: '24', legalSigunguCode: '11140' }; // 서울 중구
const JONGNO = { sigunguCode: '23', legalSigunguCode: '11110' }; // 서울 종로구

// 부천시의 세 구. TourAPI는 셋 다 부천시('11')로 준다
const WONMI = { sigunguCode: '11', legalSigunguCode: '41192' };
const SOSA = { sigunguCode: '11', legalSigunguCode: '41194' };

// 수원시. 지도에는 4칸이지만 고를 수 있는 건 "수원시" 하나뿐이라 스탬프도 하나다
const SUWON_JANGAN = { sigunguCode: '13', legalSigunguCode: '41111' };
const SUWON_YEONGTONG = { sigunguCode: '13', legalSigunguCode: '41117' };

/** 표에 없는 코드. 지도에 칠할 칸이 없으니 스탬프도 못 찍는다 */
const UNKNOWN = { sigunguCode: '99', legalSigunguCode: '99999' };

function buildTx(ownedSigunguCodes: string[] = []) {
  return {
    stamp: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          ownedSigunguCodes.map((sigunguCode) => ({ sigunguCode })),
        ),
      createManyAndReturn: jest.fn(({ data }: { data: unknown[] }) =>
        Promise.resolve(data),
      ),
    },
    pointAccount: {
      upsert: jest.fn().mockResolvedValue({ id: 'account-1', balance: 1000 }),
    },
    pointTransaction: { create: jest.fn().mockResolvedValue({}) },
  };
}

function grant(
  tx: ReturnType<typeof buildTx>,
  spots: { sigunguCode: string; legalSigunguCode: string }[],
  region: Region = Region.SEOUL,
) {
  return new CourseRewardService().grantCompletionRewards(
    tx as unknown as TxClient,
    USER_ID,
    { id: COURSE_ID, region, spots },
  );
}

/** createManyAndReturn에 실제로 넘어간 시군구 코드 */
function createdCodes(tx: ReturnType<typeof buildTx>): string[] {
  const call = tx.stamp.createManyAndReturn.mock.calls[0];
  if (!call) return [];
  return (call[0].data as { sigunguCode: string }[]).map(
    (row) => row.sigunguCode,
  );
}

describe('grantCompletionRewards - 스탬프', () => {
  it('코스가 걸친 시군구마다 하나씩 찍는다', async () => {
    // 경계에 걸친 장소가 섞이면 여러 구가 나올 수 있다 (중구 3곳 + 종로구 1곳)
    const tx = buildTx();

    await grant(tx, [JUNGGU, JUNGGU, JUNGGU, JONGNO]);

    expect(createdCodes(tx)).toEqual(['24', '23']);
  });

  it('지도가 여러 칸으로 나눠 그린 시도 스탬프는 하나다', async () => {
    // 장안구와 영통구를 둘 다 들러도 고른 건 "수원시" 하나다.
    // 칸으로 세면 스탬프가 2개가 되는데, 나머지 2칸은 채울 방법이 없어 수집률이 안 맞는다
    const tx = buildTx();

    await grant(tx, [SUWON_JANGAN, SUWON_YEONGTONG], Region.GYEONGGI);

    expect(createdCodes(tx)).toEqual(['13']);
  });

  it('지도가 한 칸으로 그린 시도 스탬프는 하나다', async () => {
    const tx = buildTx();

    await grant(tx, [WONMI, SOSA], Region.GYEONGGI);

    expect(createdCodes(tx)).toEqual(['11']);
  });

  it('폐지된 시군구 코드는 현행으로 옮겨 찍는다', async () => {
    // TourAPI가 오래된 항목에 마산시(경남 6)를 붙여 준다.
    // 그대로 찍으면 창원시와 따로 쌓여 같은 곳을 두 번 모으게 된다
    const tx = buildTx();

    await grant(
      tx,
      [{ sigunguCode: '6', legalSigunguCode: '48125' }],
      Region.GYEONGNAM,
    );

    expect(createdCodes(tx)).toEqual(['16']); // 창원시
  });

  it('이미 가진 곳은 다시 주지 않는다', async () => {
    const tx = buildTx(['24']);

    await grant(tx, [JUNGGU, JONGNO]);

    expect(createdCodes(tx)).toEqual(['23']);
  });

  it('전부 가진 곳이면 아무것도 찍지 않는다', async () => {
    const tx = buildTx(['24']);

    const result = await grant(tx, [JUNGGU]);

    expect(result.stamps).toEqual([]);
    expect(tx.stamp.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('지도에 칸이 없는 스팟은 거른다', async () => {
    // 찍어 봐야 안 칠해지는데 수집 개수만 올라간다. 사용자 눈에는 지도가 고장 난 것으로 보인다
    const tx = buildTx();

    await grant(tx, [UNKNOWN, JUNGGU]);

    expect(createdCodes(tx)).toEqual(['24']);
  });

  it('표준코드가 없어도 스탬프는 찍는다', async () => {
    // 표준코드는 기록용이다. TourAPI가 안 주는 장소 때문에 스탬프를 버리는 게 더 손해다
    const tx = buildTx();

    await grant(tx, [{ sigunguCode: '24', legalSigunguCode: null as never }]);

    expect(createdCodes(tx)).toEqual(['24']);
  });
});

describe('grantCompletionRewards - 포인트', () => {
  it('스탬프를 하나도 못 받아도 포인트는 준다', async () => {
    // 같은 동네를 다시 가도 하루를 쓴 것은 같아서 깎지 않는다
    const tx = buildTx(['24']);

    const result = await grant(tx, [JUNGGU]);

    expect(result.stamps).toEqual([]);
    expect(result.pointsAfter).toBe(1000);
    expect(tx.pointAccount.upsert).toHaveBeenCalledTimes(1);
  });

  it('적립 후 잔액을 그대로 내역에 남긴다', async () => {
    const tx = buildTx();

    await grant(tx, [JUNGGU]);

    const data = tx.pointTransaction.create.mock.calls[0][0].data;
    expect(data.amount).toBe(1000);
    expect(data.balanceAfter).toBe(1000);
    expect(data.courseId).toBe(COURSE_ID);
  });
});
