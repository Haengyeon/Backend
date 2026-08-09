---
name: Feature request
about: Suggest an idea for this project
title: ''
labels: ''
assignees: ''

---

name: "✨ Feature"
description: "새로 추가하고 싶은 기능"
title: "[Feat] "
labels: ["enhancement"]
body:
  - type: textarea
    id: what
    attributes:
      label: 어떤 기능인가요?
      placeholder: "예: 카카오 소셜 로그인 추가"
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: 왜 필요한가요?
      placeholder: "예: 회원가입 이탈률이 높아서 간편 로그인이 필요합니다."
    validations:
      required: true
  - type: textarea
    id: tasks
    attributes:
      label: 작업 목록
      value: |
        - [ ] 
        - [ ] 
  - type: textarea
    id: context
    attributes:
      label: 추가 참고사항
