# 공유 카드용 폰트

`noto-sans-kr-700.ttf` — Noto Sans KR Bold (SIL Open Font License 1.1)

공유 카드 OG 이미지를 서버에서 그릴 때만 쓴다. **사용자 브라우저로 전송되지 않는다.**

원본 5.9MB에서 한자를 빼고 한글 음절 전체(U+AC00–D7A3, 11,172자) + 라틴 + 기호만
남겨 2.3MB로 줄였다. 한글 일부만 넣는 서브셋은 더 작지만, 빠진 글자가 나오면
카드에 □로 찍힌다. 설명 문구가 AI 생성이라 어떤 글자가 올지 알 수 없으므로
음절 전체를 넣는다.

재생성:

```bash
curl -s "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700" \
  | grep -oE 'https://[^)]*\.ttf' | head -1 | xargs curl -s -o /tmp/noto.ttf
python3 -m fontTools.subset /tmp/noto.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+AC00-D7A3,U+3131-318E,U+FF01-FF5E" \
  --layout-features="" --no-hinting --desubroutinize \
  --output-file=public/fonts/noto-sans-kr-700.ttf
```
