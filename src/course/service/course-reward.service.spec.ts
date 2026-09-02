// 스탬프는 코스가 지나간 시군구마다 찍힌다.
//
// 까다로운 부분은 "몇 개를 찍을 것인가"다. 스팟 네 곳이 같은 구일 수도 있고,
// 법정동 코드가 다른데 지도에서는 한 칸으로 접히는 구도 있다.
// 찍히는 개수가 지도에 칠해지는 칸 수와 어긋나지 않아야 한다.
import { CourseRewardService } from './course-reward.service';
import { Region } from '../../generated/prisma/enums';
import { TxClient } from '../prisma-tx.type';

const COURSE_ID = 'course-1';
const USER_ID = 'user-1';

// 실제 대응표의 값이다 (sigungu-map-code.ts)
const JUNGGU = { sigunguCode: '24', legalSigunguCode: '11140' }; // 서울 중구 -> 11020
const JONGNO = { sigunguCode: '23', legalSigunguCode: '11110' }; // 서울 종로구 -> 11010

// 부천시의 세 구는 지도에 부천시 하나로 그려져 있어 모두 31050으로 접힌다
const WONMI = { sigunguCode: '1', legalSigunguCode: '41192' };
const SOSA = { sigunguCode: '1', legalSigunguCode: '41194' };

/** 대응표에 없는 코드. 칠할 칸을 못 찾으니 스탬프도 못 찍는다 */
const UNKNOWN = { sigunguCode: '99', legalSigunguCode: '99999' };

function buildTx(ownedMapCodes: string[] = []) {
  return {
    stamp: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          ownedMapCodes.map((mapSigunguCode) => ({ mapSigunguCode })),
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
) {
  return new CourseRewardService().grantCompletionRewards(
    tx as unknown as TxClient,
    USER_ID,
    { id: COURSE_ID, region: Region.SEOUL, spots },
  );
}

/** createManyAndReturn에 실제로 넘어간 지도 칸 코드 */
function createdMapCodes(tx: ReturnType<typeof buildTx>): string[] {
  const call = tx.stamp.createManyAndReturn.mock.calls[0];
  if (!call) return [];
  return (call[0].data as { mapSigunguCode: string }[]).map(
    (row) => row.mapSigunguCode,
  );
}

describe('grantCompletionRewards - 스탬프', () => {
  it('코스가 걸친 구마다 하나씩 찍는다', async () => {
    // 한 코스가 여러 구에 걸치는 일이 흔하다 (중구 3곳 + 종로구 1곳)
    const tx = buildTx();

    await grant(tx, [JUNGGU, JUNGGU, JUNGGU, JONGNO]);

    expect(createdMapCodes(tx)).toEqual(['11020', '11010']);
  });

  it('지도에서 한 칸으로 접히는 구는 하나만 찍는다', async () => {
    // 부천 원미구와 소사구는 법정동 코드가 다르지만 지도에는 부천시 한 칸이다.
    // 여기서 둘 다 찍으면 "스탬프 2개, 칠해진 칸 1개"가 된다
    const tx = buildTx();

    await grant(tx, [WONMI, SOSA]);

    expect(createdMapCodes(tx)).toEqual(['31050']);
  });

  it('이미 가진 칸은 다시 주지 않는다', async () => {
    const tx = buildTx(['11020']);

    await grant(tx, [JUNGGU, JONGNO]);

    expect(createdMapCodes(tx)).toEqual(['11010']);
  });

  it('전부 가진 칸이면 아무것도 찍지 않는다', async () => {
    const tx = buildTx(['11020']);

    const result = await grant(tx, [JUNGGU]);

    expect(result.stamps).toEqual([]);
    expect(tx.stamp.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('칠할 칸을 못 찾는 스팟은 거른다', async () => {
    // 엉뚱한 칸에 찍는 것보다 안 찍는 편이 낫다
    const tx = buildTx();

    await grant(tx, [UNKNOWN, JUNGGU]);

    expect(createdMapCodes(tx)).toEqual(['11020']);
  });
});

describe('grantCompletionRewards - 포인트', () => {
  it('스탬프를 하나도 못 받아도 포인트는 준다', async () => {
    // 같은 동네를 다시 가도 하루를 쓴 것은 같아서 깎지 않는다
    const tx = buildTx(['11020']);

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
