import type { Metadata } from "next";

import { Bullets, LegalPage, Section } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "이의제기·삭제 요청",
  description:
    "운영하시는 사이트가 잘못 표시되었다면 정정이나 삭제를 요청하실 수 있습니다.",
};

export default function AppealPage() {
  return (
    <LegalPage
      title="이의제기·삭제 요청"
      summary={`운영하시는 사이트가 ${SITE.name}에서 잘못 표시되었다면 정정이나 삭제를 요청하실 수 있습니다. 자동 검사는 틀릴 수 있고, 틀렸을 때 고치는 창구가 있어야 한다고 생각합니다.`}
    >
      <Section heading="이런 경우 요청하세요">
        <Bullets
          items={[
            "정상적으로 운영 중인 사이트가 위험 또는 주의로 표시된 경우",
            "과거에 문제가 있었으나 지금은 해결된 경우",
            "사실과 다른 신고가 접수되어 신고 건수가 표시되고 있는 경우",
            "도메인 소유자가 바뀌어 이전 소유자 때의 기록이 남아 있는 경우",
          ]}
        />
      </Section>

      <Section heading="요청 방법">
        <p>
          아래 내용을{" "}
          <a href={`mailto:${SITE.contactEmail}?subject=${encodeURIComponent("[아차차] 이의제기 요청")}`}>
            {SITE.contactEmail}
          </a>
          로 보내주세요.
        </p>
        <Bullets
          items={[
            <>
              <strong>사이트 주소</strong>
            </>,
            <>
              <strong>어떻게 표시되고 있는지</strong> — 화면을 캡처해 주시면
              빠릅니다
            </>,
            <>
              <strong>어떤 점이 사실과 다른지</strong>
            </>,
            <>
              <strong>운영자임을 확인할 수 있는 자료</strong> — 도메인 등록 정보,
              해당 도메인 이메일, 사이트에 확인용 문구를 잠시 올려두는 방법 등
            </>,
            <>
              <strong>회신받을 연락처</strong>
            </>,
          ]}
        />
        <p className="opacity-70">
          운영자 확인 자료를 요구하는 이유는, 확인 없이 삭제해 드리면 실제 피싱
          사이트 운영자도 같은 방법으로 표시를 지울 수 있기 때문입니다. 번거로우시더라도
          양해 부탁드립니다.
        </p>
      </Section>

      <Section heading="처리 절차">
        <Bullets
          items={[
            "접수 후 영업일 기준 3일 안에 접수 확인 회신",
            "검사를 다시 실행하고 신고 내용을 검토",
            "정정 사유가 확인되면 표시를 삭제하거나 수정하고 회신",
            "정정 사유가 없다고 판단되면 그 근거를 함께 회신",
          ]}
        />
        <p className="opacity-70">
          1인이 운영하는 서비스라 회신이 늦어질 수 있습니다. 3일이 지나도 회신이
          없으면 같은 주소로 다시 보내주세요.
        </p>
      </Section>

      <Section heading="긴급한 경우">
        <p>
          영업에 즉각적인 피해가 발생하고 있다면 메일 제목에{" "}
          <strong>[긴급]</strong>을 붙여주세요. 확인되는 대로 해당 표시를 임시로
          내리고 검토를 진행합니다.
        </p>
      </Section>

      <Section heading="검사 결과가 틀렸다고 알려주시는 것도 환영합니다">
        <p>
          사이트 운영자가 아니더라도, 정상 사이트가 위험으로 나오는 것을 발견하시면
          결과 화면의 신고 기능에서 <strong>&ldquo;오탐 신고&rdquo;</strong>로 알려주세요.
          오탐 신고는 위험 신고 건수에 포함되지 않고, 검사 기준을 고치는 데
          쓰입니다.
        </p>
      </Section>
    </LegalPage>
  );
}
