import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, LegalPage, Section } from "@/components/legal-page";
import { HOTLINES, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "이용약관",
  description: `${SITE.name} 검사 결과의 성격과 한계, 신고 기능 이용 규칙을 정합니다.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="이용약관"
      summary={`${SITE.name}의 검사 결과는 참고 정보이지 법적 판단이 아닙니다. 위험하다고 나오지 않았다고 해서 안전이 보장되는 것도 아니고, 위험하다고 나왔다고 해서 그 사이트가 범죄에 이용되었다고 단정하는 것도 아닙니다. 이 점을 먼저 이해하고 이용해 주세요.`}
    >
      <Section heading="1. 검사 결과의 성격">
        <p>
          검사 결과는 <strong>검사한 그 시점에 자동으로 수집한 신호를 정리한 참고 정보</strong>
          입니다. 수사기관의 판단도, 해당 사이트에 대한 법적 평가도 아닙니다.
        </p>
        <Bullets
          items={[
            <>
              <strong>&ldquo;이상 없음&rdquo;은 안전 보증이 아닙니다.</strong> 검사한 범위에서
              위험 신호를 찾지 못했다는 뜻입니다. 새로운 위험 사이트는 계속
              생기고, 일부 사이트는 방문자에 따라 다른 화면을 보여줍니다
            </>,
            <>
              <strong>&ldquo;위험&rdquo;은 범죄 사실의 확인이 아닙니다.</strong> 자동 수집한
              신호가 위험 기준에 걸렸다는 뜻이며, 오탐일 수 있습니다
            </>,
            "검사 결과만 믿고 내린 판단의 결과에 대해 책임지지 않습니다",
          ]}
        />
        <p className="opacity-70">
          금전 피해가 우려되는 상황이라면 검사 결과와 별개로 아래에 바로
          문의하세요.
        </p>
        <Bullets
          items={HOTLINES.map((line) => (
            <>
              {line.name} <strong>{line.number}</strong>
            </>
          ))}
        />
      </Section>

      <Section heading="2. 신고 기능 이용 규칙">
        <p>
          누구나 로그인 없이 신고할 수 있습니다. 다만 신고는 특정 사이트의 평판에
          영향을 주므로 아래를 지켜주세요.
        </p>
        <Bullets
          items={[
            "사실이 아닌 내용을 신고하지 마세요",
            "경쟁 사업자를 깎아내릴 목적으로 신고하지 마세요",
            "자동화된 방법으로 반복 신고하지 마세요",
          ]}
        />
        <p>
          <strong>신고는 판정에 자동으로 반영되지 않습니다.</strong> 신고가 쌓이면
          운영자가 검토한 뒤에야 표시 여부를 결정합니다. 신고 건수는 판정과 분리해
          &ldquo;신고 N건&rdquo;이라는 사실로만 보여드립니다.
        </p>
        <p className="opacity-70">
          허위 신고로 타인에게 손해를 입힌 경우 그 책임은 신고하신 분에게 있습니다.
        </p>
      </Section>

      <Section heading="3. 사이트 운영자의 이의제기">
        <p>
          운영하시는 사이트가 잘못 표시되었다면{" "}
          <Link href="/appeal">이의제기</Link>를 통해 정정이나 삭제를 요청하실 수
          있습니다. 접수된 이의제기는 확인 후 처리하고 회신드립니다.
        </p>
      </Section>

      <Section heading="4. 금지 행위">
        <Bullets
          items={[
            "검사 기능을 자동화된 방법으로 대량 호출하는 행위",
            "서비스를 이용해 타인의 시스템을 공격하거나 우회하려는 행위",
            "검사 결과를 조작해 제3자에게 잘못된 정보를 전달하는 행위",
          ]}
        />
      </Section>

      <Section heading="5. 서비스 중단과 변경">
        <p>
          무료로 제공하는 서비스이며, 사전 통지 없이 기능이 바뀌거나 중단될 수
          있습니다. 검사에 사용하는 외부 정보원의 사정으로 일부 검사 항목이
          동작하지 않을 수 있고, 이 경우 결과에 &ldquo;확인하지 못함&rdquo;으로 표시됩니다.
        </p>
      </Section>

      <Section heading="6. 문의">
        <p>
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
