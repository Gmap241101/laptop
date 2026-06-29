import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import path from 'node:path';

const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;

if (!serviceKey) {
  console.error('DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.');
  console.error('로컬 실행 예:');
  console.error('  PowerShell: $env:DATA_GO_KR_SERVICE_KEY="5d88bc1c85c4ec09181b8b75cd05c453809fe72affb456769540a82765e141ca"; npm run generate:holidays -- 2026');
  console.error('  macOS/Linux: DATA_GO_KR_SERVICE_KEY="5d88bc1c85c4ec09181b8b75cd05c453809fe72affb456769540a82765e141ca" npm run generate:holidays -- 2026');
  process.exit(1);
}

const years = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2100);

const targetYears = years.length > 0
  ? years
  : [new Date().getFullYear(), new Date().getFullYear() + 1];

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

const padMonth = (month) => String(month).padStart(2, '0');

const formatKasiDate = (locdate) => {
  const raw = String(locdate || '').trim();

  if (!/^\d{8}$/.test(raw)) {
    return '';
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

const normalizeItems = (items) => {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

const detectHolidayType = (name) => {
  const holidayName = String(name || '');

  if (holidayName.includes('임시')) {
    return 'temporary';
  }

  return 'public';
};

const parseHolidayXml = (xmlText) => {
  const parsed = parser.parse(xmlText);
  const response = parsed?.response;
  const header = response?.header;
  const resultCode = String(header?.resultCode || '');

  if (parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader) {
    const message = parsed.OpenAPI_ServiceResponse.cmmMsgHeader.errMsg ||
      parsed.OpenAPI_ServiceResponse.cmmMsgHeader.returnAuthMsg ||
      '공공데이터 API 인증 오류';
    throw new Error(message);
  }

  if (resultCode && resultCode !== '00') {
    throw new Error(`공공데이터 API 오류: ${header?.resultMsg || resultCode}`);
  }

  const items = normalizeItems(response?.body?.items?.item);

  return items
    .filter((item) => String(item?.isHoliday || '').toUpperCase() === 'Y')
    .map((item) => {
      const date = formatKasiDate(item?.locdate);
      const name = String(item?.dateName || '').trim();

      return {
        date,
        name,
        type: detectHolidayType(name),
        enabled: true,
        source: 'kasi',
      };
    })
    .filter((holiday) => holiday.date);
};

const fetchMonthHolidays = async (year, month) => {
  const params = new URLSearchParams({
    serviceKey,
    solYear: String(year),
    solMonth: padMonth(month),
    numOfRows: '100',
  });

  const apiUrl = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?${params.toString()}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`공공데이터 API 호출 실패: HTTP ${response.status}`);
  }

  const xmlText = await response.text();
  return parseHolidayXml(xmlText);
};

const generateYearFile = async (year) => {
  const holidaysByDate = new Map();

  for (let month = 1; month <= 12; month += 1) {
    const holidays = await fetchMonthHolidays(year, month);

    holidays.forEach((holiday) => {
      holidaysByDate.set(holiday.date, holiday);
    });
  }

  const holidays = Array.from(holidaysByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const outputDir = path.join(process.cwd(), 'public', 'holidays');
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `kr-holidays-${year}.json`);
  const payload = {
    year,
    updatedAt: new Date().toISOString(),
    source: 'data.go.kr KASI SpcdeInfoService getRestDeInfo',
    holidays,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  console.log(`${year}년 공휴일 ${holidays.length}건 생성 완료: ${outputPath}`);
};

for (const year of targetYears) {
  await generateYearFile(year);
}