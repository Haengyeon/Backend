import { PrismaService } from '../prisma/prisma.service';

/**
 * $transaction 콜백이 받는 클라이언트.
 *
 * 한 트랜잭션에 여러 서비스가 참여할 때(완료 처리에서 코스·스탬프·포인트를
 * 함께 쓰는 경우) 이 타입으로 tx를 넘긴다.
 */
export type TxClient = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];
