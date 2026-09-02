/**
 * 생년월일 기준 만 나이 계산.
 * 나이는 저장하지 않고 항상 생년월일에서 계산 -> 해가 바뀌어도 값이 그대로여서 매칭 나이 필터가 틀어지니
 */
export function calcAge(birthDate: Date, at: Date = new Date()): number {
    let age = at.getFullYear() - birthDate.getFullYear();

    const beforeBirthday =
        at.getMonth() < birthDate.getMonth() ||
        (at.getMonth() === birthDate.getMonth() &&
            at.getDate() < birthDate.getDate());

    if (beforeBirthday) age -= 1;

    return age;
}