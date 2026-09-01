// 코스로 받는 보상 — 스탬프와 포인트.
//
// 지금은 코스 도메인 안에 있지만, 원래 자리는 여기가 아니다.
// 출석·친구초대처럼 코스 밖에서도 포인트를 주게 되면 도메인마다 PointAccount를
// 직접 만지게 되고, 정책 하나 바꾸는 데 파일 여럿을 고쳐야 한다.
// 리워드 도메인 담당이 정해지면 이 파일째로 옮기면 된다.
import { Injectable } from '@nestjs/common';
import { PointTransactionType, Region } from '../../generated/prisma/enums';
import { TxClient } from '../prisma-tx.type';

// 지급 액수는 아직 정해지지 않았다. 정책이 확정되면 여기만 바꾸면 된다.
export const COURSE_COMPLETE_POINT = 1000;

// 후기 작성 포인트는 액수가 안 정해져서 지급 자체를 하지 않는다.
// 임의로 주면 정책이 바뀔 때 이미 준 것을 회수해야 한다.

@Injectable()
export class CourseRewardService {
  /**
   * 코스 완료 한 사람 몫 — 지역 스탬프와 완료 포인트.
   *
   * 두 사람이 같이 걸은 코스라 완료 시 각자 한 번씩 부른다.
   */
  async grantCompletionRewards(
    tx: TxClient,
    userId: string,
    course: { id: string; region: Region },
  ) {
    // 스탬프는 지역당 하나라, 이미 다녀온 지역이면 새로 주지 않는다
    const owned = await tx.stamp.findFirst({
      where: { userId, region: course.region },
      select: { id: true },
    });

    const stamp = owned
      ? null
      : await tx.stamp.create({
          data: { userId, courseId: course.id, region: course.region },
        });

    const account = await this.earnPoint(
      tx,
      userId,
      course.id,
      COURSE_COMPLETE_POINT,
      'COURSE_COMPLETE',
    );

    return {
      stamp: stamp ? { region: stamp.region, earnedAt: stamp.earnedAt } : null,
      balanceAfter: account.balance,
    };
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
