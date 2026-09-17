// 코스로 받는 보상 — 스탬프와 포인트.
//
// 지금은 코스 도메인 안에 있지만, 원래 자리는 여기가 아니다.
// 출석·친구초대처럼 코스 밖에서도 포인트를 주게 되면 도메인마다 PointAccount를
// 직접 만지게 되고, 정책 하나 바꾸는 데 파일 여럿을 고쳐야 한다.
// 리워드 도메인 담당이 정해지면 이 파일째로 옮기면 된다.
import { Injectable } from '@nestjs/common';
import { PointTransactionType, Region } from '../../generated/prisma/enums';
import { isStampableSigungu } from '../algorithm/sigungu-cells';
import { normalizeSigunguCode } from '../algorithm/sigungu-name';
import { TxClient } from '../prisma-tx.type';

// 지급 액수는 아직 정해지지 않았다. 정책이 확정되면 여기만 바꾸면 된다.
export const COURSE_COMPLETE_POINT = 1000;

// 후기 작성 포인트는 액수가 안 정해져서 지급 자체를 하지 않는다.
// 임의로 주면 정책이 바뀔 때 이미 준 것을 회수해야 한다.

/** 스탬프를 찍는 데 필요한 스팟 정보 */
type StampSource = {
  sigunguCode: string | null;
  legalSigunguCode: string | null;
};

@Injectable()
export class CourseRewardService {
  /**
   * 코스 완료 한 사람 몫 — 방문 스탬프와 완료 포인트.
   *
   * 두 사람이 같이 걸은 코스라 완료 시 각자 한 번씩 부른다.
   */
  async grantCompletionRewards(
    tx: TxClient,
    userId: string,
    course: { id: string; region: Region; spots: StampSource[] },
  ) {
    const stamps = await this.grantStamps(tx, userId, course);

    // 포인트는 스탬프와 달리 갈 때마다 준다. 같은 동네를 다시 가도
    // 하루를 쓴 것은 같아서 깎을 이유가 없다.
    const account = await this.earnPoint(
      tx,
      userId,
      course.id,
      COURSE_COMPLETE_POINT,
      'COURSE_COMPLETE',
    );

    return { stamps, pointsAfter: account.balance };
  }

  /**
   * 코스가 지나간 시군구마다 스탬프. 이미 가진 곳은 건너뛴다.
   *
   * 매칭이 시군구 단위로 성사되고 후보 풀도 그 범위라 보통 하나만 나온다.
   * 경계에 걸친 장소가 섞이면 여러 개가 나올 수 있다.
   *
   * @returns 이번에 새로 찍힌 것만. 이미 있던 곳은 안 들어간다
   */
  private async grantStamps(
    tx: TxClient,
    userId: string,
    course: { id: string; region: Region; spots: StampSource[] },
  ) {
    const visited = this.visitedSigungu(course.region, course.spots);
    if (visited.length === 0) return [];

    const owned = await tx.stamp.findMany({
      where: {
        userId,
        region: course.region,
        sigunguCode: { in: visited.map((place) => place.sigunguCode) },
      },
      select: { sigunguCode: true },
    });

    const ownedCodes = new Set(owned.map((stamp) => stamp.sigunguCode));
    const fresh = visited.filter((place) => !ownedCodes.has(place.sigunguCode));

    if (fresh.length === 0) return [];

    // skipDuplicates는 위 검사와 겹치지만, 두 코스가 같은 순간에 닫히면
    // 검사와 삽입 사이에 같은 곳이 들어올 수 있어 남겨 둔다.
    return tx.stamp.createManyAndReturn({
      data: fresh.map((place) => ({
        userId,
        courseId: course.id,
        region: course.region,
        ...place,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * 코스가 걸친 시군구를 방문 순서대로 훑으면서 중복을 뺀다.
   *
   * 묶는 기준은 시군구다. 사용자가 매칭에서 고르는 단위와 같아야
   * "어디를 가면 채워지는지"가 말이 된다.
   *
   * 지도 칸으로 묶으면 안 된다. 수원 장안구와 영통구가 따로 세어지는데
   * 사용자가 고른 건 "수원시" 하나뿐이라 나머지 칸을 채울 방법이 없어진다.
   * 반대로 부천 원미구와 소사구는 한 칸이라 스탬프 2개에 칠해진 칸 1개가 된다.
   */
  private visitedSigungu(region: Region, spots: StampSource[]) {
    const bySigungu = new Map<
      string,
      { sigunguCode: string; legalSigunguCode: string | null }
    >();

    for (const spot of spots) {
      // 폐지된 코드는 현행으로 옮긴다. 마산시로 찍으면 창원시와 따로 쌓인다
      const sigunguCode = normalizeSigunguCode(region, spot.sigunguCode);

      // 지도에 칸이 없는 코드면 스탬프도 안 찍는다. 찍어 봐야 안 칠해지는데
      // 수집 개수만 올라가서, 사용자 눈에는 지도가 고장 난 것으로 보인다.
      if (!sigunguCode || !isStampableSigungu(region, sigunguCode)) continue;

      if (!bySigungu.has(sigunguCode)) {
        bySigungu.set(sigunguCode, {
          sigunguCode,
          legalSigunguCode: spot.legalSigunguCode,
        });
      }
    }

    return [...bySigungu.values()];
  }

  /**
   * 포인트 적립. 계정이 없으면 만들면서 넣는다.
   * upsert가 반환하는 balance가 적립 후 잔액이라 그대로 기록에 남긴다.
   */
  async earnPoint(
    tx: TxClient,
    userId: string,
    courseId: string,
    amount: number,
    reasonCode: string,
  ) {
    const account = await tx.pointAccount.upsert({
      where: { userId },
      create: { userId, balance: amount },
      update: { balance: { increment: amount } },
    });

    await tx.pointTransaction.create({
      data: {
        pointAccountId: account.id,
        courseId,
        type: PointTransactionType.EARN,
        amount,
        balanceAfter: account.balance,
        reasonCode,
      },
    });

    return account;
  }
}
