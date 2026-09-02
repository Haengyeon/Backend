import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';

/** 인증 없이 접근 가능한 엔드포인트에 붙인다 (로그인, 콜백 등) */
export const Public = () => SetMetadata(PUBLIC_KEY, true);