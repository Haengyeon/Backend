// 모은 스탬프를 읽는다. 기록 탭의 수집 지도와 마이페이지의 수집 개수가 여기서 나온다.
//
// 찍는 것은 CourseRewardService(코스 도메인)가 완료 시점에 한다. 스탬프 행에
// 지도 칸 코드가 이미 들어 있어서, 여기서는 코드 변환 없이 읽어서 이름만 붙인다.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Region } from '../../generated/prisma/enums';
import { REGION_LABEL } from '../../course/algorithm/labels';
import {
  MAP_SIGUNGU_TOTAL,
  lumpedCellNameOf,
} from '../../course/algorithm/sigungu-map-code';
import { sigunguNameOf } from '../../course/algorithm/sigungu-name';
import { StampCollectionResponseDto } from '../dto/response/stamp-response.dto';

/** 시·도 수. "17곳 중 몇 곳"의 분모다 */
const REGION_TOTAL = Object.keys(REGION_LABEL).length;

@Injectable()
export class StampService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 내가 모은 스탬프 전부.
   *
   * 페이징하지 않는다. 상한이 지도 칸 수(250)라 다 모아도 한 페이지에 들어가고,
   * 지도는 어차피 전부를 한 번에 칠해야 해서 잘라 주면 쓸 수가 없다.
   */
  async getCollection(userId: string): Promise<StampCollectionResponseDto> {
    const rows = await this.prisma.stamp.findMany({
      where: { userId },
      orderBy: [{ earnedAt: 'desc' }, { id: 'desc' }],
      select: {
        region: true,
        sigunguCode: true,
        mapSigunguCode: true,
        courseId: true,
        earnedAt: true,
      },
    });

    const regions = new Set<Region>(rows.map((stamp) => stamp.region));

    return {
      collectedCount: rows.length,
      totalCount: MAP_SIGUNGU_TOTAL,
      regionCount: regions.size,
      totalRegionCount: REGION_TOTAL,
      stamps: rows.map((stamp) => ({
        region: stamp.region,
        regionLabel: REGION_LABEL[stamp.region],
        // 이름은 저장하지 않고 코드로 만든다. 시군구가 개편되면 표만 고치면 되고,
        // 이미 찍힌 스탬프까지 되돌릴 필요가 없다.
        //
        // 지도가 구를 안 나눠 그린 칸은 칸 이름을 쓴다. 부천 원미구를 다녀와도
        // 칠해지는 건 부천시 전체라, 목록에만 "원미구"라고 적으면 지도와 어긋난다
        sigunguName:
          lumpedCellNameOf(stamp.mapSigunguCode) ??
          sigunguNameOf(stamp.region, stamp.sigunguCode),
        mapSigunguCode: stamp.mapSigunguCode,
        courseId: stamp.courseId,
        earnedAt: stamp.earnedAt,
      })),
    };
  }
}
