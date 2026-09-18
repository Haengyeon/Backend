import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';

/**
 * 배경음악 파일을 고른다.
 *
 * assets/bgm 폴더 안의 음원 중 하나를 랜덤으로 선택한다.
 * 폴더가 없거나 비어 있으면 null을 반환하고 영상은 무음으로 생성된다.
 */
export function pickBgmPath(): string | null {
    const dir =
        process.env.BGM_DIR ??
        join(process.cwd(), 'assets', 'bgm');

    if (!existsSync(dir)) {
        return null;
    }

    const files = readdirSync(dir)
        .filter((file) => /\.(mp3|m4a|aac|wav)$/i.test(file))
        .sort();

    if (files.length === 0) {
        return null;
    }

    const index = randomInt(files.length);
    const selected = files[index];

    console.log('[BGM] files:', files);
    console.log('[BGM] selected:', selected);

    return join(dir, selected);
}